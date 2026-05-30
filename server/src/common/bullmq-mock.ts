import { Module as NestModule, Inject } from '@nestjs/common';

const Module = require('module');

if (process.env.REDIS_MOCK === 'true') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: REDIS_MOCK cannot be enabled in production environment. Redis server is strictly required.',
    );
  }
  console.log(
    '⚠️ REDIS_MOCK is true: Intercepting and mocking @nestjs/bullmq and bullmq modules.',
  );

  const originalLoad = Module._load;

  // Define Mock Classes
  class MockQueue {
    constructor(public name: string) {}
    async add(name: string, data: any, opts?: any) {
      console.log(`[MockQueue ${this.name}] Job added: ${name}`, data);
      return { id: `mock-job-${Date.now()}` };
    }
    async getWaitingCount() {
      return 0;
    }
    async getDelayedCount() {
      return 0;
    }
    async getFailedCount() {
      return 0;
    }
    async getActiveCount() {
      return 0;
    }
    async getCompletedCount() {
      return 0;
    }
  }

  class MockJob {
    public attemptsMade = 0;
    public opts: any = {};
    constructor(
      public id: string,
      public name: string,
      public data: any,
    ) {}
  }

  // Decorators and helpers
  const Processor = (name: string) => (target: any) => {};

  class MockWorkerHost {
    worker = {
      pause: async () => {
        console.log('Mock Worker Paused');
      },
      resume: async () => {
        console.log('Mock Worker Resumed');
      },
    };
  }

  const InjectQueue = (name: string) => {
    return Inject(`BullQueue_${name}`);
  };

  const getQueueToken = (name: string) => `BullQueue_${name}`;

  // Mock NestJS BullModule
  @NestModule({})
  class MockBullModule {
    static forRoot(options: any) {
      return {
        module: MockBullModule,
        providers: [],
        exports: [],
      };
    }

    static forRootAsync(options: any) {
      return {
        module: MockBullModule,
        imports: options.imports || [],
        providers: [],
        exports: [],
      };
    }

    static registerQueue(...queues: any[]) {
      const providers = queues.map((q) => {
        const name = typeof q === 'string' ? q : q.name;
        return {
          provide: `BullQueue_${name}`,
          useValue: new MockQueue(name),
        };
      });

      return {
        module: MockBullModule,
        providers: providers,
        exports: providers,
      };
    }
  }

  // Intercept module loading
  Module._load = function (request: string, parent: any, isMain: boolean) {
    if (request === '@nestjs/bullmq') {
      return {
        BullModule: MockBullModule,
        Processor,
        WorkerHost: MockWorkerHost,
        InjectQueue,
        getQueueToken,
      };
    }
    if (request === 'bullmq') {
      return {
        Queue: MockQueue,
        Job: MockJob,
        WorkerHost: MockWorkerHost,
      };
    }
    return originalLoad.apply(this, arguments);
  };
}
