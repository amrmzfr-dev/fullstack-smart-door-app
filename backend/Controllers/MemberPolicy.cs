namespace SmartDoor.Api.Controllers;

public static class MemberPolicy
{
    // Authorization policy for a signed-in person (not an admin).
    public const string Name = "Member";
}
