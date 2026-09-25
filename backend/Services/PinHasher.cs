using System.Security.Cryptography;
using System.Text;

namespace SmartDoor.Api.Services;

// SHA-256(salt + pin), lowercase hex. The door firmware computes exactly the
// same thing (see pinMatches in firmware/door-controller/src/main.cpp), so any
// change here must be mirrored there.
//
// A 4-digit PIN has only 10,000 values, so this is not a slow
// password hash — it only keeps plain PINs out of the database, the API and
// the door's flash. Real protection is the keypad itself (one guess at a time).
public class PinHasher : IPinHasher
{
    public PinHashResult Hash(string pin)
    {
        var salt = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8));
        return new PinHashResult(salt, Compute(salt, pin));
    }

    public bool Verify(string pin, string salt, string hash) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(Compute(salt, pin)),
            Encoding.ASCII.GetBytes(hash));

    private static string Compute(string salt, string pin) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(salt + pin)));
}
