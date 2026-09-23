/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@astrojs/db" />

interface ImportMetaEnv {
	readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Extend Astro App.Locals interface
declare namespace App {
	interface RuntimeEnv {
		[key: string]: unknown;
	}

	interface Locals {
		runtime?: {
			env: RuntimeEnv;
		};
		user?: {
			id: string;
			username: string;
			email: string;
			displayName: string;
			role: 'admin' | 'sef' | 'gar_mudur' | 'user';
			station?: string | null;
			sicilNo?: string | null;
			kkyNo?: string | null;
			bagliBirim?: string | null;
		};
	}
}
