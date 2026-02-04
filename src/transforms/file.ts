import ts from "typescript"
import type { TransformState } from "./index.js"
import { transformStatementList } from "./statement/index.js"

export function transformFile(state: TransformState, file: ts.SourceFile): ts.SourceFile {
	state.loadJecsSymbols(file)

	return ts.factory.updateSourceFile(file, transformStatementList(state, file, file.statements))
}
