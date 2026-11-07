#!/usr/bin/env python3
"""Milestone 4G REAPER evidence helper (no third-party packages): list X11 windows on a display, capture ONE window to PNG,
or press a key in one window. Used only for the isolated REAPER check; it never captures the whole desktop.

  x11-window-tool.py list                      -> JSON [{id, name, pid, width, height, viewable}]
  x11-window-tool.py shot <window-id> <png>    -> writes the window's pixels (XGetImage, 24/32-bit TrueColor)
  x11-window-tool.py key <window-id> Return …  -> raise + focus that window, then XTest key presses in order
  x11-window-tool.py click <window-id> <x> <y> -> XTest left click at window-relative coordinates
"""
import ctypes, ctypes.util, json, struct, sys, zlib

x11 = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xtst = ctypes.CDLL(ctypes.util.find_library('Xtst') or 'libXtst.so.6')
Window = ctypes.c_ulong

class XWindowAttributes(ctypes.Structure):
    _fields_ = [('x', ctypes.c_int), ('y', ctypes.c_int), ('width', ctypes.c_int), ('height', ctypes.c_int), ('border_width', ctypes.c_int),
                ('depth', ctypes.c_int), ('visual', ctypes.c_void_p), ('root', Window), ('class_', ctypes.c_int), ('bit_gravity', ctypes.c_int),
                ('win_gravity', ctypes.c_int), ('backing_store', ctypes.c_int), ('backing_planes', ctypes.c_ulong), ('backing_pixel', ctypes.c_ulong),
                ('save_under', ctypes.c_int), ('colormap', ctypes.c_ulong), ('map_installed', ctypes.c_int), ('map_state', ctypes.c_int),
                ('all_event_masks', ctypes.c_long), ('your_event_mask', ctypes.c_long), ('do_not_propagate_mask', ctypes.c_long),
                ('override_redirect', ctypes.c_int), ('screen', ctypes.c_void_p)]

class XImage(ctypes.Structure):
    _fields_ = [('width', ctypes.c_int), ('height', ctypes.c_int), ('xoffset', ctypes.c_int), ('format', ctypes.c_int), ('data', ctypes.POINTER(ctypes.c_ubyte)),
                ('byte_order', ctypes.c_int), ('bitmap_unit', ctypes.c_int), ('bitmap_bit_order', ctypes.c_int), ('bitmap_pad', ctypes.c_int),
                ('depth', ctypes.c_int), ('bytes_per_line', ctypes.c_int), ('bits_per_pixel', ctypes.c_int),
                ('red_mask', ctypes.c_ulong), ('green_mask', ctypes.c_ulong), ('blue_mask', ctypes.c_ulong)]

x11.XOpenDisplay.restype = ctypes.c_void_p; x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XDefaultRootWindow.restype = Window; x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XQueryTree.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(Window), ctypes.POINTER(Window), ctypes.POINTER(ctypes.POINTER(Window)), ctypes.POINTER(ctypes.c_uint)]
x11.XFetchName.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(ctypes.c_char_p)]
x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(XWindowAttributes)]
x11.XGetImage.restype = ctypes.POINTER(XImage); x11.XGetImage.argtypes = [ctypes.c_void_p, Window, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]
x11.XInternAtom.restype = ctypes.c_ulong; x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x11.XGetWindowProperty.argtypes = [ctypes.c_void_p, Window, ctypes.c_ulong, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]
x11.XKeysymToKeycode.restype = ctypes.c_ubyte; x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XStringToKeysym.restype = ctypes.c_ulong; x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, Window]; x11.XSetInputFocus.argtypes = [ctypes.c_void_p, Window, ctypes.c_int, ctypes.c_ulong]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]; x11.XFree.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
x11.XTranslateCoordinates.argtypes = [ctypes.c_void_p, Window, Window, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(Window)]

dpy = x11.XOpenDisplay(None)
if not dpy: sys.exit('cannot open display')

def prop_text(w, name):
    atom, actual, fmt, n, after, data = x11.XInternAtom(dpy, name, 0), ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong(), ctypes.POINTER(ctypes.c_ubyte)()
    if x11.XGetWindowProperty(dpy, w, atom, 0, 1024, 0, 0, ctypes.byref(actual), ctypes.byref(fmt), ctypes.byref(n), ctypes.byref(after), ctypes.byref(data)) != 0 or not data: return None
    try:
        if fmt.value == 8: return bytes(data[:n.value]).decode('utf-8', 'replace')
        if fmt.value == 32: return ctypes.cast(data, ctypes.POINTER(ctypes.c_ulong))[0]
    finally: x11.XFree(data)

def windows():
    out, stack = [], [(x11.XDefaultRootWindow(dpy), 0)]
    while stack:
        w, depth = stack.pop()
        root, parent, children, count = Window(), Window(), ctypes.POINTER(Window)(), ctypes.c_uint()
        if x11.XQueryTree(dpy, w, ctypes.byref(root), ctypes.byref(parent), ctypes.byref(children), ctypes.byref(count)) and children:
            kids = [children[i] for i in range(count.value)]; x11.XFree(children)
            for k in kids:
                attr = XWindowAttributes(); x11.XGetWindowAttributes(dpy, k, ctypes.byref(attr))
                name = prop_text(k, b'_NET_WM_NAME')
                if name is None:
                    raw = ctypes.c_char_p()
                    if x11.XFetchName(dpy, k, ctypes.byref(raw)) and raw.value: name = raw.value.decode('latin-1')
                pid = prop_text(k, b'_NET_WM_PID')
                if name: out.append({'id': k, 'name': name, 'pid': pid, 'width': attr.width, 'height': attr.height, 'viewable': attr.map_state == 2})
                if depth < 2: stack.append((k, depth + 1))
    return out

def png(path, width, height, rows):
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(b'\x00' + r for r in rows), 6)) + chunk(b'IEND', b''))

def shot(w, path):
    attr = XWindowAttributes(); x11.XGetWindowAttributes(dpy, w, ctypes.byref(attr))
    image = x11.XGetImage(dpy, w, 0, 0, attr.width, attr.height, 0xffffffff, 2)  # ZPixmap
    if not image: sys.exit('XGetImage failed')
    im = image.contents
    if im.bits_per_pixel != 32: sys.exit('unsupported bpp %d' % im.bits_per_pixel)
    raw = ctypes.string_at(im.data, im.bytes_per_line * im.height)
    rows = []
    for y in range(im.height):
        line = raw[y * im.bytes_per_line:y * im.bytes_per_line + im.width * 4]
        rgb = bytearray(im.width * 3); rgb[0::3] = line[2::4]; rgb[1::3] = line[1::4]; rgb[2::3] = line[0::4]; rows.append(bytes(rgb))
    png(path, im.width, im.height, rows); print(json.dumps({'window': w, 'width': im.width, 'height': im.height, 'path': path}))

def key(w, names):
    x11.XRaiseWindow(dpy, w); x11.XSetInputFocus(dpy, w, 2, 0); x11.XSync(dpy, 0)
    for name in names:
        code = x11.XKeysymToKeycode(dpy, x11.XStringToKeysym(name.encode()))
        xtst.XTestFakeKeyEvent(dpy, code, 1, 0); xtst.XTestFakeKeyEvent(dpy, code, 0, 30); x11.XSync(dpy, 0)
    print(json.dumps({'window': w, 'keys': names}))

def click(w, x, y):
    rx, ry, child = ctypes.c_int(), ctypes.c_int(), Window()
    x11.XRaiseWindow(dpy, w); x11.XTranslateCoordinates(dpy, w, x11.XDefaultRootWindow(dpy), x, y, ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(child)); x11.XSync(dpy, 0)
    xtst.XTestFakeMotionEvent(dpy, -1, rx.value, ry.value, 0); xtst.XTestFakeButtonEvent(dpy, 1, 1, 30); xtst.XTestFakeButtonEvent(dpy, 1, 0, 30); x11.XSync(dpy, 0)
    print(json.dumps({'window': w, 'click': [x, y], 'root': [rx.value, ry.value]}))

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
if cmd == 'list': print(json.dumps(windows()))
elif cmd == 'shot': shot(int(sys.argv[2]), sys.argv[3])
elif cmd == 'key': key(int(sys.argv[2]), sys.argv[3:])
elif cmd == 'click': click(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]))
else: sys.exit(__doc__)
