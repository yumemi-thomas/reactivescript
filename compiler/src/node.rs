//! The Node-API build (`--features node`): the crate in process for `@reactivescript/compiler` and its Vite front end
//! (`vite.mjs`), in place of spawning `rxc app`.
use napi_derive::napi;

/// `rxc app`'s answer, as JSON text: the program `entry` (an absolute path) starts, for `target` (dom, ssr or
/// universal; dom by default) over `module_name` (`@solidjs/web` by default). `spa`: a client-only build (dom, not
/// hydratable), checked under 08 CN-3d.
#[napi]
/// `whole` (E-5a): the program's modules checked as the whole program, with `hosts` the modules a JS host imports with
/// `?rx-lib`. `unchecked` (MO-14g): compiled whatever the checkers say — for the tool that runs a router's module to
/// ask it for its routes, never for a build.
#[allow(clippy::too_many_arguments)]
pub fn app(entry: String, target: Option<String>, module_name: Option<String>, spa: Option<bool>, library: Option<bool>, whole: Option<bool>, hosts: Option<Vec<String>>, unchecked: Option<bool>) -> String {
    let target = crate::app::target(target.as_deref().unwrap_or("dom"));
    crate::app::app_with(&entry, target, module_name.as_deref().unwrap_or("@solidjs/web"), spa.unwrap_or(false), library.unwrap_or(false), whole.unwrap_or(false), &hosts.unwrap_or_default(), unchecked.unwrap_or(false)).to_string()
}
