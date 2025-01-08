import servicesData from '@/service-registry/service_registry.json';
import type { Service, ServiceRegistry } from '@/service-registry/types/index';

const services: ServiceRegistry = servicesData;

export function getService(serviceId: string): Service {
  return services[serviceId];
}
