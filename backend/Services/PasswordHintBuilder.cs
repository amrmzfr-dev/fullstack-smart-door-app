namespace SmartDoor.Api.Services;

// Rules and the on-screen reminder for web-app passwords.
public static class PasswordHintBuilder
{
    public const int MinLength = 6;
    public const int MaxLength = 64;

    // Null when the password is acceptable, otherwise what is wrong with it.
    public static string? Check(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength)
        {
            return $"The new password needs at least {MinLength} characters.";
        }

        return password.Length > MaxLength ? $"The new password can be at most {MaxLength} characters." : null;
    }

    // "shahrol2026" -> "sh*******26": the first two and last two characters, one
    // star for each one in between. Passwords too short to hide anything behind
    // that show only their first character.
    public static string Build(string password)
    {
        if (password.Length < 5)
        {
            return password[..1] + new string('*', password.Length - 1);
        }

        return password[..2] + new string('*', password.Length - 4) + password[^2..];
    }
}
