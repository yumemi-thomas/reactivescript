// The app's toaster over @kobalte/core's. The library's `toaster.show` is a method of an object, and a row declares a
// function: the app hands it out as one, with the parts a toast is written with (09 MO-10c, MO-11u).
import { Toast, toaster } from "@kobalte/core/toast";
export { Toast };
export const show = toast => toaster.show(toast);
