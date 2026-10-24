export type CadMesh = { name?: string; color?: number[]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } };
export type CadNode = { name: string; meshes: number[]; children: CadNode[] };
export type CadResult = { success: boolean; meshes: CadMesh[]; root: CadNode };
export type ImportRequest = { buffer: ArrayBuffer; name: string };
export type ImportResponse = { result: CadResult } | { error: string };
