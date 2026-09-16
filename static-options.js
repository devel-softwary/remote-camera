// Runtime modules are not fingerprinted: always revalidate them after a deploy.
export const publicStaticOptions = {
  extensions: ['html'],
  maxAge: 0,
  etag: true
};
