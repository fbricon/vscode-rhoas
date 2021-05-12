import { TelemetryEvent, TelemetryService } from '@redhat-developer/vscode-redhat-telemetry/lib';
import { authentication, commands, ExtensionContext, Uri, window } from 'vscode';
import { rhosakService } from './rhosakService';
import { createRemoteCluster } from './wizard';

export const OPEN_RHOSAK_DASHBOARD_CMD = 'rhoas.open.RHOSAKDashboard';
export const DELETE_RHOSAK_CLUSTER_CMD = 'rhoas.delete.RHOSAKCluster';
export const CREATE_RHOSAK_CLUSTER_CMD = 'rhoas.create.RHOSAKCluster';
const LANDING_PAGE = 'https://cloud.redhat.com/beta/application-services/streams';

export function registerCommands (context: ExtensionContext, telemetryService:TelemetryService ) {
    context.subscriptions.push(
		commands.registerCommand(OPEN_RHOSAK_DASHBOARD_CMD, (clusterItem?: any) => {
			let clusterId:string|undefined;
			if (clusterItem?.cluster?.id) {
				clusterId = clusterItem.cluster.id;
			} else if (clusterItem?.id) {
				clusterId = clusterItem.id;
			}
			const reason = clusterId?"Cluster page":"Manual invocation";
			openRHOSAKDashboard(telemetryService, reason, clusterId);
		})
	);
	context.subscriptions.push(
		commands.registerCommand(DELETE_RHOSAK_CLUSTER_CMD, async (clusterItem?: any) => {
			let clusterId:string|undefined;
			if (clusterItem?.cluster?.id) {
				clusterId = clusterItem.cluster.id;
			} else if (clusterItem?.id) {
				clusterId = clusterItem.id;
			}
			if (!clusterId) {
				return;
			}
			let name: string|undefined; 
			if (clusterItem?.cluster?.name) {
				name = clusterItem.cluster.name;
			} else if (clusterItem?.name) {
				name = clusterItem.name;
			}
			const deleteConfirmation = await window.showWarningMessage(`Are you sure you want to physically delete remote cluster '${name}'?`, 'Cancel', 'Delete');
        	if (deleteConfirmation !== 'Delete') {
            	return;
        	}

			const session = await authentication.getSession('redhat-account-auth', ['openid'], { createIfNone: true });
			if (session) {
				let event = {
					name: "rhoas.delete.rhosak.cluster",
					properties:[]
				} as TelemetryEvent;
				try {
					await rhosakService.deleteKafka(clusterId!, session.accessToken);
				} catch (error) {
					event.properties.error = error.message;
					window.showErrorMessage(`Failed to delete remote Kafka cluster '${name}': ${error.message}`);
				}
				telemetryService.send(event);
				const deleteRequest = {
					clusterIds: [clusterId]
				};
				return commands.executeCommand("vscode-kafka.api.deleteclusters", deleteRequest);
			}
		})
	);
    context.subscriptions.push(
		commands.registerCommand(CREATE_RHOSAK_CLUSTER_CMD, async () => {
			try {
				const clusters = await createRemoteCluster(telemetryService);
				if (clusters && clusters.length > 0){
					return commands.executeCommand("vscode-kafka.api.saveclusters", clusters);
				}
			} catch(error) {
				console.log(error);
				window.showErrorMessage(error.message);
			}
		})
	);
}

export async function openRHOSAKDashboard(telemetryService:TelemetryService, reason: string, clusterId?:string) {
	let event = {
		name: "rhoas.open.rhosak.dashboard",
		properties: {
			"reason": reason
		}
	};
	let page = LANDING_PAGE;
	if (clusterId) {
		page = `${page}/kafkas/${clusterId}`;
	}
	telemetryService.send(event);
	return commands.executeCommand('vscode.open', Uri.parse(page));
}