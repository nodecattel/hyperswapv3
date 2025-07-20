/**
 * External Library Type Definitions
 * 
 * Type definitions for external libraries and APIs
 */

import { Request, Response } from 'express';
import { Socket } from 'socket.io';

// ============================================================================
// Express.js Extended Types
// ============================================================================

export interface ExtendedRequest extends Request {
  user?: any;
  session?: any;
}

export interface ExtendedResponse extends Response {
  success: (data?: any) => void;
  error: (message: string, code?: number) => void;
}

// ============================================================================
// Socket.IO Extended Types
// ============================================================================

export interface ExtendedSocket extends Socket {
  userId?: string;
  authenticated?: boolean;
}

export interface SocketEventMap {
  connection: (socket: ExtendedSocket) => void;
  disconnect: (reason: string) => void;
  initialData: (data: any) => void;
  statusUpdate: (status: any) => void;
  newTrade: (trade: any) => void;
  performanceUpdate: (performance: any) => void;
  configUpdate: (config: any) => void;
  requestUpdate: () => void;
}

// ============================================================================
// Winston Logger Types
// ============================================================================

export interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format?: any;
  transports?: any[];
  defaultMeta?: any;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: any;
}

// ============================================================================
// Inquirer.js Extended Types
// ============================================================================

export interface InquirerChoice {
  name: string;
  value: any;
  short?: string;
  disabled?: boolean | string;
}

export interface InquirerQuestion {
  type: 'input' | 'password' | 'confirm' | 'list' | 'checkbox' | 'number';
  name: string;
  message: string;
  default?: any;
  choices?: InquirerChoice[];
  validate?: (input: any, answers?: any) => boolean | string;
  filter?: (input: any) => any;
  when?: (answers: any) => boolean;
  pageSize?: number;
  prefix?: string;
  suffix?: string;
  askAnswered?: boolean;
}

// ============================================================================
// Ethers.js Extended Types
// ============================================================================

export interface ContractCallOptions {
  gasLimit?: number;
  gasPrice?: number;
  value?: number;
  nonce?: number;
}

export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  gasUsed?: number;
  effectiveGasPrice?: number;
  status?: number;
}

// ============================================================================
// WebSocket Extended Types
// ============================================================================

export interface WebSocketOptions {
  protocols?: string | string[];
  timeout?: number;
  headers?: { [key: string]: string };
  origin?: string;
  agent?: any;
  perMessageDeflate?: boolean;
}

export interface WebSocketEventMap {
  open: () => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
  message: (data: any) => void;
  ping: (data: Buffer) => void;
  pong: (data: Buffer) => void;
}

// ============================================================================
// Axios Extended Types
// ============================================================================

export interface APIRequestConfig {
  timeout?: number;
  headers?: { [key: string]: string };
  params?: { [key: string]: any };
  retries?: number;
  retryDelay?: number;
}

export interface APIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: any;
  config: any;
}

// ============================================================================
// Node.js Process Types
// ============================================================================

export interface ProcessEnv {
  [key: string]: string | undefined;
  NODE_ENV?: 'development' | 'production' | 'test';
  LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug';
  DRY_RUN?: 'true' | 'false';
  PRIVATE_KEY?: string;
  RPC_URL?: string;
  GRID_MIN_PRICE?: string;
  GRID_MAX_PRICE?: string;
  GRID_COUNT?: string;
  GRID_TOTAL_INVESTMENT?: string;
  GRID_PROFIT_MARGIN?: string;
  WEBSOCKET_ENABLED?: 'true' | 'false';
  DASHBOARD_PORT?: string;
}

// ============================================================================
// File System Types
// ============================================================================

export interface FileSystemOptions {
  encoding?: BufferEncoding;
  flag?: string;
  mode?: number;
}

export interface DirectoryEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  size?: number;
  mtime?: Date;
}

// ============================================================================
// Crypto Types
// ============================================================================

export interface CryptoKeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface SignatureResult {
  signature: string;
  recovery: number;
  v: number;
  r: string;
  s: string;
}

// ============================================================================
// Timer Types
// ============================================================================

export interface TimerHandle {
  ref(): void;
  unref(): void;
  hasRef(): boolean;
  refresh(): void;
}

export type TimeoutHandle = TimerHandle;
export type IntervalHandle = TimerHandle;

// ============================================================================
// Event Emitter Types
// ============================================================================

export interface EventEmitterOptions {
  captureRejections?: boolean;
}

export interface EventListener {
  (...args: any[]): void;
}

export interface EventListenerOptions {
  once?: boolean;
  prepend?: boolean;
}

// ============================================================================
// Stream Types
// ============================================================================

export interface StreamOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
  objectMode?: boolean;
  autoDestroy?: boolean;
}

export interface ReadableStreamOptions extends StreamOptions {
  read?: (size: number) => void;
  destroy?: (error: Error | null, callback: (error?: Error | null) => void) => void;
}

export interface WritableStreamOptions extends StreamOptions {
  write?: (chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void) => void;
  writev?: (chunks: Array<{chunk: any, encoding: BufferEncoding}>, callback: (error?: Error | null) => void) => void;
  destroy?: (error: Error | null, callback: (error?: Error | null) => void) => void;
  final?: (callback: (error?: Error | null) => void) => void;
}

// ============================================================================
// Buffer Types
// ============================================================================

export interface BufferConstructorOptions {
  type: 'Buffer';
  data: number[];
}

export interface BufferEncoding {
  encoding: 'ascii' | 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'base64url' | 'latin1' | 'binary' | 'hex';
}

// ============================================================================
// URL Types
// ============================================================================

export interface URLSearchParamsInit {
  [key: string]: string | string[] | undefined;
}

export interface URLOptions {
  protocol?: string;
  hostname?: string;
  port?: string | number;
  pathname?: string;
  search?: string;
  hash?: string;
}

// ============================================================================
// Utility Types for External Libraries
// ============================================================================

export type CallbackFunction<T = any> = (error: Error | null, result?: T) => void;

export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

export type EventHandler<T = any> = (event: T) => void | Promise<void>;

export type Middleware<T = any> = (req: T, res: any, next: () => void) => void | Promise<void>;

export type ValidationFunction<T = any> = (value: T) => boolean | string | Promise<boolean | string>;

export type TransformFunction<T = any, U = any> = (value: T) => U | Promise<U>;

export type FilterFunction<T = any> = (value: T) => boolean | Promise<boolean>;

export type ComparatorFunction<T = any> = (a: T, b: T) => number;

export type SerializerFunction<T = any> = (value: T) => string | Buffer;

export type DeserializerFunction<T = any> = (data: string | Buffer) => T;
