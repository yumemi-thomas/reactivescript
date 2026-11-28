// What the app asks its server for: how many changes went out. It can fail (the network), and says so.
export class Offline extends Error {}
export async function pushChanges(n) {
  await new Promise(r => setTimeout(r, 20));
  if (n < 0) throw new Offline("offline");
  return n;
}
