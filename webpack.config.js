const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./yajsapi/mid-level-api/index.ts",
  mode: "development",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // "ya-ts-client/dist/ya-activity/api$": path.resolve(__dirname, "tests/mock/activity_api.ts"),
      [path.resolve(__dirname, "./yajsapi/mid-level-api/activity/secure")]: false,
      [path.resolve(__dirname, "./yajsapi/storage/gftp")]: false,
    },
    fallback: {
      child_process: "empty",
      // fs: require.resolve("browserify-fs"),
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer/"),
      timers: require.resolve("timers-browserify"),
      // dgram: require.resolve("dgram-browserify"),
      // util: require.resolve("util"),
      // http: require.resolve("stream-http"),
      // https: require.resolve("https-browserify"),
      // net: require.resolve("net-browserify"),
      // crypto: require.resolve("crypto-browserify"),
      // path: require.resolve("path-browserify"),
      // os: require.resolve("os-browserify"),
      // zlib: require.resolve("browserify-zlib"),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
  output: {
    filename: "bundle.js",
    // path: path.resolve(__dirname, "tests/web/activity"),
    path: path.resolve(__dirname, "examples/web"),
    library: "yajsapi",
  },
};
