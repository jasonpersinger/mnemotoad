export function backingSize(width: number, height: number, dpr: number): {
    width: number;
    height: number;
    scale: number;
} {
    const scale = Math.min(4, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
    return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}
