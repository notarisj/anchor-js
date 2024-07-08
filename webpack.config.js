const path = require('path');

module.exports = {
    mode: 'development', // You can switch to 'production' later
    entry: './src/anchor.js',  // Entry point of your application
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.js$/, // Use Babel for transpiling modern JS
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
        ],
    },
};
