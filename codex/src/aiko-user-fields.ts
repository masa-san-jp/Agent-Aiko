/** Parse only values on the same line; empty fields must not consume the next field. */
export function parseUserFields(content: string): { name?: string; address?: string } {
  const result: { name?: string; address?: string } = {};
  const name = content.match(/^name:[ \t]*([^\r\n]+)$/m)?.[1]?.trim();
  const address = content.match(/^address:[ \t]*([^\r\n]+)$/m)?.[1]?.trim();
  if (name) result.name = name;
  if (address) result.address = address;
  return result;
}
