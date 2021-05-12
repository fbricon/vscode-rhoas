import { CloudProvider, CloudProviderList, CloudRegion, Configuration, DefaultApi, KafkaRequest, KafkaRequestPayload } from "@rhoas/kafka-management-sdk";

export namespace rhosakService {

    const BASE_API = 'https://api.openshift.com';

    let cloudProviders : CloudProvider[];
    let cloudRegions = new Map<string, CloudRegion[]>();

    export async function listKafkas(token: string):Promise<KafkaRequest[]> {
        const apisService = getApisService(token);
        const clusters: KafkaRequest[] = [];
        let page = 1;
        let response;
        let hasMore = true;
        try {
            while(hasMore) {
                response = await apisService.getKafkas( ''+page, '100', 'name asc');
                const kafkas = response.data;
                if (kafkas) {
                    clusters.push(...kafkas.items!);
                    hasMore = kafkas.total > clusters.length;
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
        return clusters;
    }

    export async function createKafka(request: KafkaRequestPayload, token: string):Promise<KafkaRequest> {
        const apisService = getApisService(token);
        try {
            const response = await apisService.createKafka(true, request);
            return response.data;
        } catch( e) {
            console.log(e);
            if (e?.response?.data?.reason) {
                throw new Error(`Failed to create a remote Kafka cluster: ${e.response.data.reason}`);
            }
            throw e;
        }
    }

    export async function getCloudProviders(token: string):Promise<CloudProvider[]> {
        if (cloudProviders) {
            return cloudProviders;
        }
        const apisService = getApisService(token);
        const _cloudProviders: CloudProvider[] = [];
        let page = 1;
        let response;
        let hasMore = true;
        try {
            while(hasMore) {
                response = await apisService.getCloudProviders( ''+page, '100');
                const providersList = response.data;
                if (providersList) {
                    _cloudProviders.push(...providersList.items!);
                    hasMore = providersList.total > _cloudProviders.length;
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
        cloudProviders = _cloudProviders.filter(cp => cp.enabled);
        return cloudProviders;
    }
    export async function getCloudRegions(cloudId: string, token: string):Promise<CloudRegion[]> {
        if (cloudRegions.has(cloudId)) {
            return cloudRegions.get(cloudId)!;
        }
        const apisService = getApisService(token);
        const _cloudRegions: CloudRegion[] = [];
        let page = 1;
        let response;
        let hasMore = true;
        try {
            while(hasMore) {
                response = await apisService.getCloudProviderRegions(cloudId, ''+page, '100');
                const regionsList = response.data;
                if (regionsList) {
                    _cloudRegions.push(...regionsList.items!);
                    hasMore = regionsList.total > _cloudRegions.length;
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            console.log(e);
            throw e;
        }
        const regions = _cloudRegions.filter(cr => cr.enabled);
        cloudRegions.set(cloudId, regions);
        return regions;
    }

    export async function deleteKafka(id: string, token: string):Promise<void> {
        const apisService = getApisService(token);
        try {
            const response = await apisService.deleteKafkaById(id, true);
            if (response.data) {
                throw response.data;
            };
        } catch( e) {
            if (e?.response?.data?.reason) {
                throw new Error(e.response.data.reason);
            }
            console.log(e);
            throw e;
        }
    }

    function getApisService(token: string) {
        const apiConfig = new Configuration({
            basePath: BASE_API,
            accessToken: token
        });
        return new DefaultApi(apiConfig);
    }
}