import posthog from 'posthog-js';

export const captureEvent = (eventName: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    posthog.capture(eventName, properties);
  }
};

export const identifyUser = (user: { email?: string; userId: string; role?: string; tenantId?: string; workspaceId?: string }) => {
  if (typeof window !== 'undefined') {
    posthog.identify(user.userId, {
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      workspaceId: user.workspaceId
    });
  }
};
