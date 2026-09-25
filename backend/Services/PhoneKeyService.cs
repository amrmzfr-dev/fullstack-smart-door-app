using System.Text.Json;
using Fido2NetLib;
using Fido2NetLib.Objects;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;
using StackExchange.Redis;

namespace SmartDoor.Api.Services;

public class PhoneKeyService(
    AppDbContext dbContext,
    IFido2 fido2,
    IConnectionMultiplexer redis,
    IDoorAccessService doorAccessService,
    ILogger<PhoneKeyService> logger) : IPhoneKeyService
{
    private const int MaxLabelLength = 64;
    private const string SetupPrefix = "smartdoor:webauthn:setup:";
    private const string UnlockPrefix = "smartdoor:webauthn:unlock:";

    // How long the person has to touch the sensor after the prompt appears.
    private static readonly TimeSpan ChallengeLifetime = TimeSpan.FromMinutes(3);

    private sealed record PendingSetup(Guid MemberId, string OptionsJson);

    public async Task<ServiceResult<WebAuthnChallenge>> StartSetupAsync(string pin, CancellationToken cancellationToken)
    {
        var member = await doorAccessService.FindMemberByPinAsync(pin, cancellationToken);
        if (member is null)
        {
            return ServiceResult<WebAuthnChallenge>.Invalid("Wrong PIN.");
        }

        var existing = await dbContext.PhoneKeys
            .AsNoTracking()
            .Where(k => k.MemberId == member.Id)
            .Select(k => k.CredentialId)
            .ToListAsync(cancellationToken);

        var options = fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = new Fido2User
            {
                Id = member.Id.ToByteArray(),
                Name = member.Name,
                DisplayName = member.Name,
            },
            ExcludeCredentials = existing.Select(id => new PublicKeyCredentialDescriptor(id)).ToList(),
            // Built-in reader only (no USB keys), must actually check the
            // finger/face, and kept on the phone so unlocking needs no username.
            AuthenticatorSelection = new AuthenticatorSelection
            {
                AuthenticatorAttachment = AuthenticatorAttachment.Platform,
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required,
            },
            AttestationPreference = AttestationConveyancePreference.None,
        });

        var flowId = Guid.NewGuid();
        var optionsJson = options.ToJson();
        await redis.GetDatabase().StringSetAsync(
            SetupPrefix + flowId,
            JsonSerializer.Serialize(new PendingSetup(member.Id, optionsJson)),
            ChallengeLifetime);

        return ServiceResult<WebAuthnChallenge>.Ok(new WebAuthnChallenge(flowId, optionsJson));
    }

    public async Task<ServiceResult<PhoneKey>> FinishSetupAsync(
        Guid flowId,
        string? label,
        JsonElement credential,
        CancellationToken cancellationToken)
    {
        // GETDEL: each challenge can only be answered once.
        var stored = await redis.GetDatabase().StringGetDeleteAsync(SetupPrefix + flowId);
        if (stored.IsNullOrEmpty)
        {
            return ServiceResult<PhoneKey>.Invalid("That took too long. Start again.");
        }

        var pending = JsonSerializer.Deserialize<PendingSetup>(stored.ToString());
        var member = pending is null
            ? null
            : await dbContext.Members.FirstOrDefaultAsync(m => m.Id == pending.MemberId, cancellationToken);
        if (pending is null || member is null)
        {
            return ServiceResult<PhoneKey>.NotFound("Person not found.");
        }

        RegisteredPublicKeyCredential registered;
        try
        {
            var attestation = credential.Deserialize<AuthenticatorAttestationRawResponse>()
                ?? throw new JsonException("Empty credential.");

            registered = await fido2.MakeNewCredentialAsync(
                new MakeNewCredentialParams
                {
                    AttestationResponse = attestation,
                    OriginalOptions = CredentialCreateOptions.FromJson(pending.OptionsJson),
                    IsCredentialIdUniqueToUserCallback = async (args, ct) =>
                        !await dbContext.PhoneKeys.AnyAsync(k => k.CredentialId == args.CredentialId, ct),
                },
                cancellationToken);
        }
        catch (Exception ex) when (ex is Fido2VerificationException or JsonException)
        {
            logger.LogWarning(ex, "Phone setup failed for member {MemberId}", member.Id);
            return ServiceResult<PhoneKey>.Invalid("This phone couldn't be set up. Try again.");
        }

        var cleanLabel = label?.Trim();
        var key = new PhoneKey
        {
            Id = Guid.NewGuid(),
            MemberId = member.Id,
            CredentialId = registered.Id,
            PublicKey = registered.PublicKey,
            SignCount = registered.SignCount,
            Label = string.IsNullOrEmpty(cleanLabel)
                ? "Phone"
                : cleanLabel[..Math.Min(cleanLabel.Length, MaxLabelLength)],
        };
        dbContext.PhoneKeys.Add(key);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<PhoneKey>.Ok(key);
    }

    public async Task<ServiceResult<WebAuthnChallenge>> StartUnlockAsync(CancellationToken cancellationToken)
    {
        if (!await doorAccessService.IsDoorOnlineAsync())
        {
            return ServiceResult<WebAuthnChallenge>.Conflict("The door is offline right now.");
        }

        // No allow-list: the phone offers whichever of its passkeys is ours,
        // and the credential ID it answers with tells us who it is.
        var options = fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = [],
            UserVerification = UserVerificationRequirement.Required,
        });

        var flowId = Guid.NewGuid();
        var optionsJson = options.ToJson();
        await redis.GetDatabase().StringSetAsync(UnlockPrefix + flowId, optionsJson, ChallengeLifetime);
        return ServiceResult<WebAuthnChallenge>.Ok(new WebAuthnChallenge(flowId, optionsJson));
    }

    public async Task<ServiceResult<Member>> FinishUnlockAsync(
        Guid flowId,
        JsonElement credential,
        CancellationToken cancellationToken)
    {
        var stored = await redis.GetDatabase().StringGetDeleteAsync(UnlockPrefix + flowId);
        if (stored.IsNullOrEmpty)
        {
            return ServiceResult<Member>.Invalid("That took too long. Try again.");
        }

        try
        {
            var assertion = credential.Deserialize<AuthenticatorAssertionRawResponse>()
                ?? throw new JsonException("Empty credential.");

            var key = await dbContext.PhoneKeys
                .Include(k => k.Member)
                .FirstOrDefaultAsync(k => k.CredentialId == assertion.RawId, cancellationToken);
            if (key?.Member is null)
            {
                return ServiceResult<Member>.Invalid("This phone isn't set up for the door.");
            }

            var ownerHandle = key.Member.Id.ToByteArray();
            var result = await fido2.MakeAssertionAsync(
                new MakeAssertionParams
                {
                    AssertionResponse = assertion,
                    OriginalOptions = AssertionOptions.FromJson(stored.ToString()),
                    StoredPublicKey = key.PublicKey,
                    StoredSignatureCounter = (uint)key.SignCount,
                    IsUserHandleOwnerOfCredentialIdCallback = (args, _) =>
                        Task.FromResult(args.UserHandle.SequenceEqual(ownerHandle)),
                },
                cancellationToken);

            if (!key.Member.Enabled)
            {
                return ServiceResult<Member>.Invalid("You can't open this door right now.");
            }

            key.SignCount = result.SignCount;
            key.LastUsedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
            return ServiceResult<Member>.Ok(key.Member);
        }
        catch (Exception ex) when (ex is Fido2VerificationException or JsonException)
        {
            logger.LogWarning(ex, "Phone unlock failed verification");
            return ServiceResult<Member>.Invalid("Fingerprint not accepted. Try again.");
        }
    }

    public async Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var key = await dbContext.PhoneKeys.FirstOrDefaultAsync(k => k.Id == id, cancellationToken);
        if (key is null)
        {
            return ServiceResult<bool>.NotFound("Phone not found.");
        }

        dbContext.PhoneKeys.Remove(key);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Ok(true);
    }
}
