namespace SmartDoor.Api.Services;

public sealed record PinHashResult(string Salt, string Hash);

public interface IPinHasher
{
    PinHashResult Hash(string pin);
    bool Verify(string pin, string salt, string hash);
}
