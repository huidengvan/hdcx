# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2026-10-20]

### Fixed
- 适配 Docusaurus v3 配置规范（迁移 `onBrokenMarkdownLinks` 至 `markdown.hooks` 并添加 `onBrokenAnchors`）
- 添加 `@docusaurus/types` 开发依赖，解决配置文件的 TypeScript 类型定义解析报错
