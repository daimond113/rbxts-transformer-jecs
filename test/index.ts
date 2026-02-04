/// <reference types="vite/client" />
import { VirtualProject } from "roblox-ts"
import transformer from "../src/index.js"
import { resolve } from "path/posix"

export const compile = async (source: string): Promise<string> => {
	const project = new VirtualProject()
	project.tsTransformers.push((program) =>
		transformer(program, { resolutionHost: project["compilerHost"], silent: true }),
	)

	const files = import.meta.glob("../node_modules/@rbxts/**/{package.json,*.d.ts}", {
		eager: true,
		query: "?raw",
		import: "default",
	})
	for (const [path, content] of Object.entries(files)) {
		const isDefinition = path.endsWith(".d.ts")
		const absolutePath = path.replace("../", "/")
		project.vfs.writeFile(absolutePath, content as string)
		if (!isDefinition) {
			const pkgJson = JSON.parse(content as string)
			const pkgName = absolutePath.split("/").slice(-3, -1).join("/")
			const mainPath = resolve(`/${pkgName}`, pkgJson.main ?? "").substring(1)
			const typingsPath = resolve(`/${pkgName}`, pkgJson.types ?? pkgJson.typings ?? "index.d.ts").substring(1)
			project.setMapping(`/node_modules/${typingsPath}`, `/node_modules/${mainPath}`)
		}
	}

	project.vfs.writeFile(
		"/src/ecs.ts",
		`
		import { world as World } from "@rbxts/jecs"
		export const world = World()
		export const A = world.component<string>()
		export const B = world.component<number>()
		export const C = world.component<boolean>()
		type Unnameable = { readonly __unique: unique symbol }
		export const D = world.component<Unnameable>()
		`,
	)

	try {
		return project.compileSource(source + "\n;export {};")
	} catch (e) {
		if (typeof e === "object" && e !== null) {
			throw e.toString()
		}
		throw e
	}
}
