// CSS Modules type declarations for apps/web.
// Next.js generates next-env.d.ts at runtime (gitignored), so this file is
// the stable source of *.module.css typing for tsc, the IDE, and `bun test`
// runs that happen before `next dev` or `next build` has populated next-env.d.ts.
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
