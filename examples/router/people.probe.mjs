// rx-verify's probe for people.d.rx: the arguments the app passes, so `pure` is checked (two calls with the same id
// answer alike). getPerson, where there is one, is a router query: it runs only inside a router, so it is
// left to the app's tests.
export const probes = {
  fetchPerson: { args: () => ["1"] },
};
