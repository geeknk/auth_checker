const {Sequelize} = require('sequelize');
const fs = require('fs')


const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const sequelize = new Sequelize({
    dialect: 'mysql',
    host: config['db']['hostname'],
    port: config['db']['port'],
    username: config['db']['Database user'],
    password: config['db']['Database pass'],
    database: config['db']['Database name']
  });

  async function testConnection() {
    try {
      await sequelize.authenticate();
      console.log('Connection has been established successfully.');
    } catch (error) {
      console.error('Unable to connect to the database:', error);
    }
  }
  
  // Export sequelize instance for use in other modules
  module.exports = { sequelize, testConnection };