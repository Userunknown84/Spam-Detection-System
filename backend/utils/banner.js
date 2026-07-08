const figlet = require('figlet');
const chalk = require('chalk');

const displayBanner = () => {
    console.log(chalk.cyan(figlet.textSync('Spam Detector', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    })));

console.log(chalk.green(`\n🚀 Server running on http://localhost:${process.env.PORT || 3000}`));
    console.log(chalk.yellow(`📦 Environment: ${process.env.NODE_ENV || 'development'}`));
    console.log(chalk.blue(`🔗 Health: http://localhost:${process.env.PORT || 3000}/health\n`));
};

module.exports = displayBanner;
