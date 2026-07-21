import type { SelectionRect } from "../utils/types";
export interface KeyboardHandlerArgs {
    selection: SelectionRect;
    totalRows: number;
    totalCols: number;
    isEditing: boolean;
    setSelection: (_rect: SelectionRect) => void;
    startEdit: (_row: number, _col: number, _initial?: string) => void;
    commitEdit: () => void;
    cancelEdit: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onDelete: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSave?: () => void;
}
export declare function handleKeyboard(e: KeyboardEvent, args: KeyboardHandlerArgs): void;
//# sourceMappingURL=keyboard.d.ts.map