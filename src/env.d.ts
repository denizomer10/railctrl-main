/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
	// JWT
	readonly JWT_SECRET: string;
	readonly JWT_EXPIRES_IN: string;
	
	// Şifreleme
	readonly ENCRYPTION_KEY: string;
	
	// Uygulama
	readonly APP_NAME?: string;
	readonly APP_URL?: string;
	readonly NODE_ENV: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Extend Astro App.Locals interface
declare namespace App {
	interface RuntimeEnv {
		JWT_SECRET?: string;
		ENCRYPTION_KEY?: string;
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
