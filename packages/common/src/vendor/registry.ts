export function createRegistry<T>() {
  const items: Record<string, T> = {};

  function register(id: string, item: T) {
    items[id] = item;
  }

  function get(id: string): T {
    const item = items[id];
    if (!item) {
      throw new Error(`Item with id ${id} not found in registry.`);
    }
    return item;
  }

  function getAll(): Record<string, T> {
    return items;
  }

  return { register, get, getAll };
}
