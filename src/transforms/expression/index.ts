import ts from "typescript"
import type { TransformState } from "../index.js"
import { transformCallExpression } from "./callExpression.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TRANSFORMERS = new Map<ts.SyntaxKind, (state: TransformState, node: any) => ts.Expression | undefined>([
	[ts.SyntaxKind.CallExpression, transformCallExpression],
])

export function transformExpression(state: TransformState, expression: ts.Expression): ts.Expression {
	return TRANSFORMERS.get(expression.kind)?.(state, expression) ?? state.transform(expression)
}
