export function getDB(locals: App.Locals): D1Database {
  return locals.runtime.env.DB;
}
