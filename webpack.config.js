const CONFIG = {
  mode: "development",
  devtool: false,

  entry: {
    app: "./src/virtualCamera.js"
  },

  output: {
    library: "VirtualCameraManager",
    filename: "[name].js",
    path: require('path').resolve(__dirname, 'extension')
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        loader: "babel-loader",
        options: {
          presets: [
            "@babel/preset-env",
            "@babel/react",
            {
              plugins: ["@babel/plugin-proposal-class-properties"]
            }
          ]
        }
      }
    ]
  }
};

module.exports =  CONFIG