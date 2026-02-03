import ts from "typescript"
import type { TransformState } from "./index.js"
import { transformExpression } from "./expression/index.js"
import { transformStatement } from "./statement/index.js"

export function transformNode(state: TransformState, node: ts.Node): ts.Node | ts.Statement[] {
	if (ts.isExpression(node)) {
		return transformExpression(state, node)
	} else if (ts.isStatement(node)) {
		return transformStatement(state, node)
	}

	return ts.visitEachChild(node, (newNode) => transformNode(state, newNode), state.context)
}
