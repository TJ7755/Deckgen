#!/usr/bin/env node

import chalk from 'chalk';
import { run } from './src/cli.js';

run().catch(err => {
  console.error(chalk.red('\nFatal error:'), err.message || err);
  process.exit(1);
});
