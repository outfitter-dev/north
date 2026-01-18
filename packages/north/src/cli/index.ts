#!/usr/bin/env node

import { Command } from "commander";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("north")
  .description("Design system enforcement CLI tool")
  .version(VERSION, "-v, --version", "Output the current version");

program.parse();
