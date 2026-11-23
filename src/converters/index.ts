/** Registers the built-in converters, in tie-break order. */
import { bootstrap3 } from './bootstrap3';
import { bootstrap5 } from './bootstrap5';
import { cssgrid } from './cssgrid';
import { foundation5 } from './foundation5';
import { foundation6 } from './foundation6';
import { fusioncss } from './fusioncss';
import { registerConverter } from './registry';
import { tailwind } from './tailwind';

export const builtinConverters = [fusioncss, bootstrap5, bootstrap3, foundation6, foundation5, tailwind, cssgrid];

export function registerBuiltinConverters(): void {
	for (const c of builtinConverters) registerConverter(c);
}

export { bootstrap3, bootstrap5, cssgrid, foundation5, foundation6, fusioncss, tailwind };
