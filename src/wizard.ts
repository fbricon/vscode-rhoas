/* eslint-disable @typescript-eslint/naming-convention */
import { TelemetryEvent, TelemetryService } from "@redhat-developer/vscode-redhat-telemetry/lib";
import { authentication, ProgressLocation, QuickPickItem, window } from "vscode";
import { openRHOSAKDashboard } from "./commands";
import { MultiStepInput, State } from "./multiStepInput";
import { rhosakService } from "./rhosakService";
import { convert } from './utils';
import { Cluster } from './vscodekafka-api';

interface NewClusterState extends State {
    name: string;
    cloud_provider: string;
    region: string;
    multi_az: boolean;
}

export async function createRemoteCluster(telemetryService:TelemetryService): Promise<Cluster[] | undefined> {
    const session = await authentication.getSession('redhat-account-auth', ['openid'], { createIfNone: true });
	
    const state = {
        cloud_provider: "aws",
        region: "us-east-1",
        multi_az:true,
    } as NewClusterState;
    
    await collectInputs(state, session.accessToken);
    if (!state.name) {
        return;
    }
    if (session) {
        let event = {
            name: "rhoas.create.rhosak.cluster",
            properties: {
                "cloud.provider": state.cloud_provider,
                "region": state.region,
                "multi.az": state.multi_az
            }
        } as TelemetryEvent;
        try {
            const cluster = await createClusterReq(telemetryService, session.accessToken, state);
            telemetryService.send(event);
            return cluster;
        } catch (e) {
            event.properties.error = e.message;
            telemetryService.send(event);
            throw e;
        }
    }
}

async function createClusterReq(telemetryService:TelemetryService, token: string, state: NewClusterState): Promise<Cluster[]> {
	const clusters: Cluster[] = [];
	
    const cluster = await rhosakService.createKafka(state, token);
	if (cluster?.status === 'accepted') {
        openRHOSAKDashboard(telemetryService, "create cluster");

		let newCluster = await window.withProgress({
			location: ProgressLocation.Notification,
            cancellable: true
		}, async (progress) => {
			progress.report({
				message: `Creating remote Kafka cluster '${state.name}'`,
			});
			return waitForCluster(cluster.id!, token, []);
		});
		if (newCluster) {
			clusters.push(newCluster);
		}
	}
	return clusters;
}

async function waitForCluster(id: string, token: string, existingNames: string[]): Promise<Cluster> {
	const newCluster = (await rhosakService.listKafkas(token)).find(cluster => id === cluster.id);
	if (!newCluster) {
		throw new Error(`Cannot find cluster ${id}`);
	}
	if (newCluster.status === 'failed') {
        const reason = newCluster.failed_reason ? `: ${newCluster.failed_reason}` : '';
		throw new Error(`Failed to provision remote cluster '${newCluster.name}'${reason}`);
	} 
    if (newCluster.status === 'deprovision' || newCluster.status === 'deleting') {
        throw new Error(`Remote cluster '${newCluster.name}' is being deleted.`);
    }
	if (newCluster.status === 'ready') {
		return convert(newCluster, existingNames);
	}
	return new Promise<Cluster> (resolve => {
		setTimeout(() => {
			resolve(waitForCluster(id, token, existingNames));
		  }, 5000);
	});
}

async function collectInputs(state: Partial<NewClusterState>, token: string) {
    await MultiStepInput.run(input => inputName(input, state, token));
}

async function inputName(input: MultiStepInput, state: Partial<NewClusterState>, token: string) {
    state.name = await input.showInputBox({
        title: "Cluster name",
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        value: state.name?state.name:'',
        prompt: 'Cluster name',
        validate: validateName
    });
    return (input: MultiStepInput) => inputCloudProvider(input, state, token);
}

const nameRegexp = new RegExp('^[a-z]([-a-z0-9]*[a-z0-9])?$');
async function validateName(name :string): Promise<string | undefined>{
    if (!name || name.trim().length === 0) {
        return "Name is required";
    }
    if (!nameRegexp.test(name)) {
        return "Name must match '^[a-z]([-a-z0-9]*[a-z0-9])?$'";
    }
}

async function inputCloudProvider(input: MultiStepInput, state: Partial<NewClusterState>, token: string) {
    const providers = await rhosakService.getCloudProviders(token);
    const providersMap = new Map(providers.map(provider => [provider.display_name!, provider.id!]));
    const choices = providers.map(provider => { return {label:provider.display_name!, id:provider.id!};} );
    
    const cloudProviderLabel = (await input.showQuickPick({
        title: "Cloud Provider",
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        items: choices,
        activeItem: choices.find(choice => choice.id === state.cloud_provider),
        prompt: 'Cloud Provider',
    })).label;
    state.cloud_provider = providersMap.get(cloudProviderLabel)!;
    return (input: MultiStepInput) => inputRegion(input, state, token);
}

async function inputRegion(input: MultiStepInput, state: Partial<NewClusterState>, token: string) {
    const regions = await rhosakService.getCloudRegions(state.cloud_provider!, token);
    const regionsMap = new Map(regions.map(region => [region.display_name!, region.id!]));
    const choices = regions.map(region => { return {label:region.display_name!, id:region.id!};} );
    const regionLabel = (await input.showQuickPick({
        title: "Region", 
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        items: choices,
        activeItem: choices.find(item => item.id === state.region),
        prompt: 'Region',
    })).label;
    state.region = regionsMap.get(regionLabel)!;
    return (input: MultiStepInput) => inputMultiZone(input, state);
}

async function inputMultiZone(input: MultiStepInput, state: Partial<NewClusterState>) {
    const choices: QuickPickItem[] = [{label:'Multi'}];
    state.multi_az = choices[0] === (await input.showQuickPick({
        title: "Availability zones",
        step: input.getStepNumber(),
        totalSteps: state.totalSteps,
        items: choices,
        activeItem: choices.find(item => item.label === `${state.multi_az}`),
        prompt: 'Availability zones',
    }));
}
