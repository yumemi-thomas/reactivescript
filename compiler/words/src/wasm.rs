//! `request` as a call over linear memory, the ABI of the compiler's own WebAssembly build (compiler/src/wasm.rs): the
//! language server's `src/rxc.js` loads both the same way.
use serde_json::Value;

#[link(wasm_import_module = "env")]
extern "C" {
    fn rx_read(ptr: *const u8, len: usize) -> *mut u8;
}

#[no_mangle]
pub extern "C" fn rx_alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` and `n` are what `rx_alloc(n)` returned and was given.
#[no_mangle]
pub unsafe extern "C" fn rx_free(ptr: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(ptr, 0, n.max(1)));
}

fn read(path: &str) -> Option<String> {
    let p = unsafe { rx_read(path.as_ptr(), path.len()) };
    // SAFETY: the host answers with a `[len][bytes]` block it got from `rx_alloc`
    (!p.is_null()).then(|| unsafe {
        let n = u32::from_le_bytes(*(p as *const [u8; 4])) as usize;
        let s = String::from_utf8_lossy(std::slice::from_raw_parts(p.add(4), n)).into_owned();
        rx_free(p, n + 4);
        s
    })
}

/// # Safety
/// `ptr`/`len` is a request the host wrote into memory from `rx_alloc(len)`, which this frees.
#[no_mangle]
pub unsafe extern "C" fn rx_call(ptr: *mut u8, len: usize) -> *mut u8 {
    let req: Value = serde_json::from_slice(std::slice::from_raw_parts(ptr, len)).unwrap_or(Value::Null);
    rx_free(ptr, len);
    let out = crate::request(&req["params"], &read).to_string();
    let p = rx_alloc(out.len() + 4);
    std::ptr::copy_nonoverlapping((out.len() as u32).to_le_bytes().as_ptr(), p, 4);
    std::ptr::copy_nonoverlapping(out.as_ptr(), p.add(4), out.len());
    p
}
