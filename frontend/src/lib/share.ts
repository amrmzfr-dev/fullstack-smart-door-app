// The text an admin sends to a person: where to sign in, plus the login.
// The password is only known right after it was set; later it is not stored in
// readable form, so pass null and the message tells them to ask.
export function buildShareMessage(name: string, username: string, password: string | null, isAdmin: boolean): string {
  const lines = [
    `Hi ${name}, here is your Smart Door sign-in.`,
    "",
    `Open: ${window.location.origin}`,
    `Username: ${username}`,
    `Password: ${password ?? "ask your admin"}`,
    "",
    `Put it on your phone's home screen (tap, then follow the steps): ${window.location.origin}/install`,
  ];
  if (isAdmin) {
    lines.push("", "You also have admin access: you will see Overview, Doors, People and Log after you sign in.");
  }
  return lines.join("\n");
}
