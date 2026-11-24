declare module "virtual:barq-server-fns";
declare module "virtual:barq-client-assets" {
  interface ClientAssets {
    scripts: string[];
    css: string[];
  }
  export const clientAssets: ClientAssets;
}
