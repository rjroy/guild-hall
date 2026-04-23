// CSS Modules type declarations for root tsc.
// Next.js normally provides these via next-env.d.ts (generated at runtime,
// gitignored). The root tsconfig needs them because tests import from
// web/components/ which transitively reference .module.css files.
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
