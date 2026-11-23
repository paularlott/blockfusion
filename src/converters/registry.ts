/** The global converter registry. */
import type { Converter } from './types';

const converters = new Map<string, Converter>();

export function registerConverter(converter: Converter): void {
	if (!converter?.id) throw new Error('BlockFusion: a converter needs an id');
	converters.set(converter.id, converter);
}

export function getConverter(id: string): Converter | undefined {
	return converters.get(id);
}

export function listConverters(): Converter[] {
	return Array.from(converters.values());
}
