(() => {
    'use strict';

    const state = {
        user: null,
        isAdmin: false,
        isOwner: false,
        canGrantAdmin: false,
        view: 'projects',
        projects: [],
        sessions: [],
        support: null,
        supportZoneId: null,
        acknowledged: '',
        syncBusy: false,
        syncFailed: false,
        pollTimer: null,
        directoryOffset: 0,
        searchTimer: null,
        editorAcknowledged: '',
    };

    const byId = id => document.getElementById(id);
    const makeId = () => crypto.randomUUID();
    const originalAddZone = window.addZone;
    const originalRemoveZone = window.removeZone;
    const originalPackageProjectData = window.packageProjectData;
    const embeddedPortal = window.self !== window.top &&
        new URLSearchParams(window.location.search).get('embedded') === '1';

    function reservePortalTab() {
        if (!embeddedPortal) return null;
        const tab = window.open('about:blank', '_blank');
        if (tab) {
            tab.document.title = 'Heater Install Portal';
            tab.document.body.textContent = 'Signing in to the Heater Install Portal...';
        }
        return tab;
    }

    function launchPortalTab(tab) {
        if (!tab || tab.closed) return false;
        tab.opener = null;
        tab.location.replace(new URL('./', window.location.href).href);
        return true;
    }

    function showEmbeddedContinue(message) {
        byId('authIntro').textContent = message;
        for (const id of ['email', 'password', 'signInButton', 'signUpButton']) byId(id).hidden = true;
        byId('password').value = '';
        byId('continuePortalButton').hidden = false;
        byId('embeddedSignOutButton').hidden = false;
    }

    function showError(id, message) {
        const element = byId(id);
        element.textContent = message || '';
    }

    function rpc(name, parameters) {
        return _supabase.rpc(name, parameters || {});
    }

    window.askForSupportCell = function () {
        const answer = prompt('Enter your cell number with area code. Signed-in support administrators can use it to call you about live help.');
        if (answer === null) return null;
        const cell = answer.trim().replace(/[^0-9+]/g, '');
        if (!/^[+0-9 ().-]{7,40}$/.test(answer.trim()) || !/^\+?[0-9]{7,15}$/.test(cell)) {
            throw new Error('Enter a valid cell number with area code.');
        }
        return cell;
    };

    function setView(view) {
        state.view = view;
        byId('projectDashboard').hidden = view !== 'projects';
        byId('adminDashboard').hidden = view !== 'admin';
        byId('editorScreen').hidden = view !== 'editor';
        byId('myProjectsButton').hidden = view === 'projects';
        byId('adminDashboardButton').hidden = !state.isAdmin || view === 'admin';
        byId('portalTitle').textContent = view === 'projects'
            ? 'My Install Projects' : 'Heater Install Portal';
    }

    function stableStringify(value) {
        if (Array.isArray(value)) {
            return `[${value.map(stableStringify).join(',')}]`;
        }
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort()
                .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    function zoneTitle(zone) {
        return zone.roomType === 'Other' && zone.customRoomType
            ? zone.customRoomType : zone.roomType || 'Room';
    }

    function updateZoneIds(data) {
        const blocks = [...document.querySelectorAll('.zone-block')];
        data.zones = data.zones.map((zone, index) => {
            const element = blocks[index];
            if (element && !element.dataset.zoneId) element.dataset.zoneId = makeId();
            return { ...zone, id: element?.dataset.zoneId || makeId() };
        });
        return data;
    }

    window.addZone = function (...args) {
        originalAddZone.apply(this, args);
        const zone = [...document.querySelectorAll('.zone-block')].at(-1);
        if (zone && !zone.dataset.zoneId) zone.dataset.zoneId = makeId();
    };

    window.removeZone = function (...args) {
        if (state.support && document.querySelectorAll('.zone-block').length <= 1) {
            alert('Keep at least one room while live help is open.');
            return;
        }
        originalRemoveZone.apply(this, args);
    };

    window.packageProjectData = function () {
        const data = updateZoneIds(originalPackageProjectData());
        data.id = activeProjectId || null;
        return data;
    };

    function populateEditor(project) {
        const data = project.project_data || project;
        activeProjectId = project.id || data.id || activeProjectId;
        data.id = activeProjectId;
        byId('projName').value = data.projName || '';
        byId('projAddress').value = data.projAddress || '';
        byId('clientName').value = data.clientName || '';
        byId('clientPhone').value = data.clientPhone || '';
        byId('installerName').value = data.installerName || '';
        byId('installerPhone').value = data.installerPhone || '';
        byId('projNotes').value = data.projNotes || '';
        byId('zonesContainer').replaceChildren();
        zoneCounter = 0;

        for (const zoneData of data.zones || []) {
            window.addZone();
            const zone = [...document.querySelectorAll('.zone-block')].at(-1);
            zone.dataset.zoneId = zoneData.id || makeId();
            const roomType = zone.querySelector('.room-type');
            roomType.value = zoneData.roomType || 'Bedroom';
            const customRoom = zone.querySelector('.custom-room-type');
            customRoom.value = zoneData.customRoomType || '';
            customRoom.style.display = roomType.value === 'Other' ? 'block' : 'none';
            updateZoneTitle(roomType);
            zone.querySelector('.room-sqft').value = zoneData.roomSqft || 0;

            const thermostat = zone.querySelector('.thermostat-type');
            thermostat.value = zoneData.thermoType || thermostat.options[0].value;
            const customThermostat = zone.querySelector('.custom-thermo-type');
            customThermostat.value = zoneData.customThermoType || '';
            customThermostat.style.display = thermostat.value === 'Other' ? 'block' : 'none';
            if (zoneData.powerModuleType) {
                zone.querySelector('.power-module-type').value = zoneData.powerModuleType;
            }

            const tbody = zone.querySelector('.circuit-table-body');
            tbody.replaceChildren();
            for (const heater of zoneData.heaters || []) {
                addHeaterRow(zone.querySelector('.add-btn'));
                const row = [...tbody.querySelectorAll('tr')].at(-1);
                row.querySelector('.circuit-select').value = heater.circuit;
                row.querySelector('.heater-select').value = heater.heaterValue;
                row.querySelector('.qty-input').value = heater.qty;
            }
            if (!tbody.children.length) addHeaterRow(zone.querySelector('.add-btn'));
            calculateZoneTotals(roomType);
        }

        if (!data.zones?.length) window.addZone();
        updateGrandTotals();
    }

    function openEditor(project) {
        activeProjectId = project.id;
        populateEditor(project);
        state.editorAcknowledged = stableStringify(window.packageProjectData());
        byId('editorScreen').inert = false;
        byId('editorScreen').setAttribute('aria-disabled', 'false');
        setView('editor');
        window.scrollTo(0, 0);
    }

    function addButton(parent, text, callback, className = 'portal-button') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.addEventListener('click', callback);
        parent.append(button);
        return button;
    }

    function renderProjectFolders() {
        const root = byId('projectFolders');
        root.replaceChildren();
        if (!state.projects.length) {
            const empty = document.createElement('p');
            empty.className = 'portal-panel';
            empty.textContent = 'No projects yet. Start a project to create your first room.';
            root.append(empty);
            return;
        }

        for (const project of state.projects) {
            const folder = document.createElement('section');
            folder.className = 'project-folder';
            const header = document.createElement('div');
            header.className = 'folder-heading';
            const titleArea = document.createElement('div');
            titleArea.className = 'folder-title-area';
            const title = document.createElement('h3');
            title.textContent = project.project_name || 'Untitled Project';
            const count = document.createElement('span');
            const zones = project.project_data?.zones || [];
            count.textContent = `${zones.length} ${zones.length === 1 ? 'room' : 'rooms'}`;
            titleArea.append(title, count);
            const controls = document.createElement('div');
            controls.className = 'portal-toolbar';
            const toggle = addButton(controls, 'Show rooms', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!expanded));
                toggle.textContent = expanded ? 'Show rooms' : 'Hide rooms';
                roomList.hidden = expanded;
            }, 'portal-button secondary');
            toggle.setAttribute('aria-expanded', 'false');
            addButton(controls, 'Edit Project', () => openProject(project.id), 'portal-button');
            if (!state.support) {
                addButton(
                    controls, 'Request Live Help',
                    () => requestLiveHelp(project.id, null),
                    'portal-button secondary',
                );
            }
            const roomList = document.createElement('div');
            roomList.className = 'folder-rooms';
            if (!zones.length) {
                const empty = document.createElement('p');
                empty.textContent = 'This project has no rooms yet.';
                roomList.append(empty);
            }
            zones.forEach((zone, index) => {
                const row = document.createElement('div');
                row.className = 'room-row';
                const name = document.createElement('span');
                name.textContent = `Zone ${index + 1} - ${zoneTitle(zone)}`;
                row.append(name);
                addButton(row, 'Open Room', () => openProject(project.id, zone.id), 'portal-button secondary');
                roomList.append(row);
            });
            header.append(titleArea, controls);
            folder.append(header, roomList);
            roomList.hidden = true;
            root.append(folder);
        }
    }

    async function loadProjects() {
        showError('projectDashboardError', '');
        const { data, error } = await _supabase
            .from('install_projects')
            .select('id, project_name, client_name, project_data, updated_at')
            .order('updated_at', { ascending: false });
        if (error) throw error;
        state.projects = data || [];
        renderProjectFolders();
    }

    async function openProject(projectId, zoneId = null) {
        showError('projectDashboardError', '');
        const { data, error } = await _supabase
            .from('install_projects')
            .select('id, project_name, client_name, project_data')
            .eq('id', projectId)
            .single();
        if (error) {
            showError('projectDashboardError', `Could not open project: ${error.message}`);
            return;
        }
        openEditor(data);
        if (zoneId) {
            const index = [...document.querySelectorAll('.zone-block')]
                .findIndex(zone => zone.dataset.zoneId === zoneId);
            document.querySelectorAll('.zone-block')[index]?.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function makeDirectoryRow(user, isAdmin) {
        const item = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'support-row admin-directory-row';
        const label = document.createElement('span');
        label.className = 'admin-account-label';
        label.textContent = `${user.email || '(No email)'} | Cell: ${user.cell || 'Not provided'}`;
        row.append(label);
        if (isAdmin) {
            const status = document.createElement('span');
            status.className = 'admin-badge';
            status.textContent = user.is_manager ? 'Admin manager' : 'Admin';
            if (user.is_manager) status.title = 'Can grant admin access';
            row.append(status);
            if (user.coverage) {
                const coverage = document.createElement('span');
                coverage.textContent = user.coverage === 'primary' ? 'On call' : 'Backup';
                row.append(coverage);
            }
            if (state.canGrantAdmin) {
                for (const [slot, label] of [['primary', 'Set on call'], ['backup', 'Set backup']]) {
                    if (user.coverage === slot) continue;
                    addButton(row, label, async () => {
                        try {
                            const { error } = await rpc('support_set_coverage', { p_slot: slot, p_user_id: user.user_id });
                            if (error) throw error;
                            await loadAdminDashboard();
                        } catch (error) {
                            showError('adminDashboardError', `Could not assign coverage: ${error.message}`);
                        }
                    }, 'portal-button secondary');
                }
            }
        } else if (state.canGrantAdmin) {
            addButton(row, 'Grant Admin', async () => {
                if (!confirm(
                    `${user.email} will be able to search users and join projects shared for live help. ` +
                    'They will not be able to grant admin access to others. Continue?'
                )) return;
                try {
                    const { error } = await rpc('support_grant_admin', { p_user_id: user.user_id });
                    if (error) throw error;
                    alert('Admin access granted. The user must sign in again.');
                    await loadAdminDashboard();
                } catch (error) {
                    showError('adminDashboardError', `Could not grant admin access: ${error.message}`);
                }
            }, 'portal-button secondary');
        }
        item.append(row);
        return item;
    }

    function renderHelpRequests() {
        const root = byId('installHelpRequests');
        root.replaceChildren();
        byId('installHelpRequestsEmpty').hidden = state.sessions.length > 0;
        for (const session of state.sessions) {
            const row = document.createElement('div');
            row.className = 'support-row admin-request';
            const detail = document.createElement('div');
            detail.className = 'admin-request-detail';
            const title = document.createElement('strong');
            title.textContent = session.project_name || 'Install Project';
            const email = document.createElement('span');
            email.className = 'admin-muted';
            email.textContent = session.email || '(No email)';
            detail.append(title, email);
            const actions = document.createElement('div');
            actions.className = 'admin-request-actions';
            const badge = document.createElement('span');
            badge.className = 'admin-badge';
            badge.textContent = session.status === 'waiting' ? 'Waiting' : 'Active';
            actions.append(badge);
            addButton(actions, session.owner_id === currentUserId ? 'Resume' : 'Join', () => {
                openSupportSession(session.id, session.owner_id === currentUserId ? 'read' : 'join');
            });
            row.append(detail, actions);
            root.append(row);
        }
    }

    async function loadAdminDashboard() {
        showError('adminDashboardError', '');
        const search = byId('directorySearch').value.trim();
        const [directoryResult, sessionsResult] = await Promise.all([
            rpc('support_contact_directory', { p_search: search, p_offset: state.directoryOffset }),
            rpc('install_support_list'),
        ]);
        if (directoryResult.error) throw directoryResult.error;
        if (sessionsResult.error) throw sessionsResult.error;
        const directory = directoryResult.data;
        state.canGrantAdmin = directory.can_grant_admin === true;
        showError('supportCoverageStatus', directory.coverage_missing
            ? 'Assign an on-call administrator and backup to complete coverage.' : '');
        const admins = byId('adminDirectory');
        const users = byId('userDirectory');
        admins.replaceChildren();
        users.replaceChildren();
        for (const user of directory.admins || []) admins.append(makeDirectoryRow(user, true));
        for (const user of directory.users || []) users.append(makeDirectoryRow(user, false));
        const adminsEmpty = byId('adminDirectoryEmpty');
        adminsEmpty.textContent = search ? 'No matching administrators.' : 'No administrators yet.';
        adminsEmpty.hidden = admins.children.length > 0;
        const usersEmpty = byId('userDirectoryEmpty');
        usersEmpty.textContent = state.directoryOffset > 0 ? 'No more users.'
            : search ? 'No matching users.' : 'No regular users yet.';
        usersEmpty.hidden = users.children.length > 0;
        const previous = byId('previousUsersButton');
        const next = byId('nextUsersButton');
        previous.disabled = state.directoryOffset === 0;
        next.disabled = users.children.length < 20;
        byId('userPagination').hidden = previous.disabled && next.disabled;
        state.sessions = sessionsResult.data || [];
        renderHelpRequests();
    }

    async function showProjects() {
        setView('projects');
        try {
            await loadProjects();
            const { data, error } = await rpc('install_support_list');
            if (error) throw error;
            const ownSession = (data || []).find(item => item.owner_id === currentUserId);
            byId('resumeHelpButton').hidden = !ownSession;
            if (ownSession) {
                byId('resumeHelpButton').onclick = () => openSupportSession(ownSession.id, 'read');
                byId('resumeHelpButton').textContent = `Resume Live Help: ${ownSession.project_name}`;
            }
        } catch (error) {
            showError('projectDashboardError', `Could not load projects or live help: ${error.message}`);
        }
    }

    function setSupportControls() {
        const session = state.support;
        const bar = byId('liveSupportBar');
        bar.hidden = !session;
        if (!session) {
            byId('editorScreen').inert = false;
            byId('editorScreen').setAttribute('aria-disabled', 'false');
            return;
        }
        byId('editorScreen').inert = !session.can_edit || state.syncFailed;
        byId('editorScreen').setAttribute('aria-disabled', String(!session.can_edit || state.syncFailed));
        byId('liveSupportStatus').textContent = state.syncFailed
            ? 'Live help paused. Reconnect before editing.'
            : `${session.can_edit ? 'You are editing' : 'Viewing live'} — ${
                session.peer_online ? 'other participant connected' : 'waiting for other participant'
            }`;
        byId('passControlButton').hidden = !session.can_edit || !session.peer_online || state.syncFailed;
        byId('reclaimControlButton').hidden = !state.isOwner || session.can_edit || state.syncFailed;
        byId('endSupportButton').hidden = !state.isOwner;
        byId('reconnectSupportButton').hidden = !state.syncFailed;
        const room = byId('liveSupportRoom');
        room.replaceChildren();
        (session.project.zones || []).forEach((zone, index) => {
            const option = document.createElement('option');
            option.value = zone.id;
            option.textContent = `Zone ${index + 1} - ${zoneTitle(zone)}`;
            room.append(option);
        });
        room.value = session.zone_id || state.supportZoneId || room.options[0]?.value || '';
        room.disabled = !session.can_edit || state.syncFailed;
        byId('liveSupportError').textContent = state.syncFailed
            ? 'Connection lost. Editing is paused; reconnect to reload the acknowledged project.'
            : '';
    }

    function scrollToSupportZone(zoneId) {
        const zone = [...document.querySelectorAll('.zone-block')]
            .find(item => item.dataset.zoneId === zoneId);
        zone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function adoptSession(session, forceProject = false) {
        const old = state.support;
        const changedController = old && old.controller_id !== session.controller_id;
        const changedProject = old && old.revision !== session.revision
            && stableStringify(old.project) !== stableStringify(session.project);
        state.support = session;
        state.supportZoneId = session.zone_id;
        state.acknowledged = stableStringify(session.project);
        state.syncFailed = false;
        if (forceProject || changedController || changedProject || !old) {
            populateEditor({ id: session.project.id, project_data: session.project });
            state.editorAcknowledged = stableStringify(window.packageProjectData());
            scrollToSupportZone(session.zone_id);
        }
        setSupportControls();
    }

    async function supportAction(action, payload = {}) {
        const { data, error } = await rpc('install_support_session', {
            p_id: state.support.id,
            p_action: action,
            p_payload: payload,
        });
        if (error) throw error;
        return data;
    }

    async function flushSupportProject() {
        if (!state.support?.can_edit) return;
        const project = window.packageProjectData();
        project.id = state.support.project.id;
        const encoded = stableStringify(project);
        const selectedZoneId = byId('liveSupportRoom').value || state.support.zone_id;
        const zoneId = project.zones.some(zone => zone.id === selectedZoneId)
            ? selectedZoneId : project.zones[0]?.id;
        if (encoded === state.acknowledged && zoneId === state.support.zone_id) return;
        const next = await supportAction('save', {
            revision: state.support.revision,
            project,
            zone_id: zoneId,
        });
        state.support = next;
        state.supportZoneId = next.zone_id;
        state.acknowledged = encoded;
        setSupportControls();
    }

    function scheduleSupportPoll() {
        clearTimeout(state.pollTimer);
        if (state.support && !state.syncFailed) {
            state.pollTimer = setTimeout(pollSupport, 500);
        }
    }

    async function pollSupport() {
        if (!state.support || state.syncBusy || state.syncFailed) return;
        state.syncBusy = true;
        try {
            const previousRevision = state.support.revision;
            await flushSupportProject();
            const next = await supportAction('read');
            if (next.status === 'ended' && state.isOwner) {
                await leaveSupport();
                await showProjects();
                return;
            }
            const changedController = next.controller_id !== state.support.controller_id;
            const remoteChanged = next.revision !== previousRevision
                && stableStringify(next.project) !== state.acknowledged;
            if (changedController || (remoteChanged && !next.can_edit)) {
                adoptSession(next, true);
            } else {
                state.support = next;
                state.supportZoneId = next.zone_id;
                setSupportControls();
            }
        } catch (error) {
            console.error('Install live-help synchronization stopped:', error);
            state.syncFailed = true;
            showError('liveSupportError', `Live-help synchronization stopped: ${error.message}`);
            setSupportControls();
        } finally {
            state.syncBusy = false;
            scheduleSupportPoll();
        }
    }

    async function openSupportSession(sessionId, action) {
        try {
            const { data, error } = await rpc('install_support_session', {
                p_id: sessionId, p_action: action, p_payload: {},
            });
            if (error) throw error;
            state.isOwner = data.owner_id === currentUserId;
            state.support = data;
            state.syncFailed = false;
            activeProjectId = data.project.id;
            setView('editor');
            adoptSession(data, true);
            window.scrollTo(0, 0);
            scheduleSupportPoll();
        } catch (error) {
            const target = state.view === 'admin' ? 'adminDashboardError'
                : state.view === 'projects' ? 'projectDashboardError' : 'liveSupportError';
            showError(target, `Could not open install help: ${error.message}`);
        }
    }

    async function requestLiveHelp(projectId, zoneId) {
        const project = state.projects.find(item => item.id === projectId);
        if (!project) {
            showError('projectDashboardError', 'Refresh the project list before requesting help.');
            return;
        }
        const zones = project.project_data.zones || [];
        if (!zones.length) {
            showError('projectDashboardError', 'Add and save a room before requesting live help.');
            return;
        }
        const roomId = zoneId || zones[0].id;
        const room = zones.find(item => item.id === roomId);
        const consent = confirm(
            `Request live help for "${project.project_name}"?\n\n` +
            `This shares this entire install project, its address, client and installer details, ` +
            `notes, every room, heater selections, and material totals with an approved administrator. ` +
            `It does not share your other projects. The administrator can view the project after you approve. ` +
            `Only one person edits at a time; you can take back control or end access.\n\n` +
            `Starting room: ${room ? zoneTitle(room) : 'first room'}`
        );
        if (!consent) return;
        try {
            const contact = await rpc('support_cell');
            if (contact.error) throw contact.error;
            if (!contact.data) {
                const cell = window.askForSupportCell();
                if (cell === null) return;
                const saved = await rpc('support_set_cell', { p_cell: cell });
                if (saved.error) throw saved.error;
            }
            const { data, error } = await rpc('install_support_start', {
                p_project_id: projectId,
                p_zone_id: roomId,
            });
            if (error) throw error;
            await openSupportSession(data, 'read');
        } catch (error) {
            showError('projectDashboardError', `Could not request live help: ${error.message}`);
        }
    }

    async function handoff(action) {
        if (!state.support) return;
        if (state.syncBusy) {
            alert('Live help is synchronizing. Please try again in a moment.');
            return;
        }
        clearTimeout(state.pollTimer);
        state.syncBusy = true;
        try {
            await flushSupportProject();
            const next = await supportAction(action, {
                revision: state.support.revision,
            });
            adoptSession(next, true);
        } catch (error) {
            state.syncFailed = true;
            showError('liveSupportError', `Could not ${action} control: ${error.message}`);
            setSupportControls();
        } finally {
            state.syncBusy = false;
            scheduleSupportPoll();
        }
    }

    async function leaveSupport() {
        clearTimeout(state.pollTimer);
        state.support = null;
        state.syncFailed = false;
        state.syncBusy = false;
        state.acknowledged = '';
        state.editorAcknowledged = stableStringify(window.packageProjectData());
        byId('liveSupportError').textContent = '';
        setSupportControls();
    }

    window.passInstallControl = () => handoff('pass');
    window.reclaimInstallControl = async () => {
        if (!confirm('Take back control? Any unshared administrator edits may be lost.')) return;
        await handoff('reclaim');
    };
    window.endInstallSupport = async () => {
        if (state.syncBusy) {
            alert('Live help is synchronizing. Please try again in a moment.');
            return;
        }
        if (!confirm('End live help and save the last acknowledged install project? The administrator will immediately lose access.')) return;
        clearTimeout(state.pollTimer);
        state.syncBusy = true;
        try {
            await flushSupportProject();
            const result = await supportAction('end', { revision: state.support.revision });
            await leaveSupport();
            activeProjectId = result.project.id;
            await showProjects();
        } catch (error) {
            state.syncFailed = true;
            showError('liveSupportError', `Could not end and save live help: ${error.message}`);
            setSupportControls();
        } finally {
            state.syncBusy = false;
        }
    };
    window.reconnectInstallSupport = async () => {
        if (state.syncBusy) {
            alert('Live help is synchronizing. Please try again in a moment.');
            return;
        }
        if (!confirm('Reconnect and discard local changes that were not acknowledged by the server?')) return;
        clearTimeout(state.pollTimer);
        state.syncBusy = true;
        try {
            const next = await supportAction('read');
            adoptSession(next, true);
        } catch (error) {
            showError('liveSupportError', `Reconnect failed: ${error.message}`);
        } finally {
            state.syncBusy = false;
            scheduleSupportPoll();
        }
    };

    window.saveProjectToCloud = async function () {
        if (state.support && state.syncBusy) {
            alert('Live help is synchronizing. Please try again in a moment.');
            return;
        }
        const button = byId('saveCloudBtn');
        button.disabled = true;
        const original = button.textContent;
        button.textContent = 'Saving...';
        const savingSupport = !!state.support;
        if (savingSupport) {
            clearTimeout(state.pollTimer);
            state.syncBusy = true;
        }
        try {
            if (state.support) {
                await flushSupportProject();
                alert('Install project changes synchronized with live help.');
                return;
            }
            if (!activeProjectId) activeProjectId = makeId();
            const project = window.packageProjectData();
            project.id = activeProjectId;
            const projectName = byId('projName').value.trim() || 'Untitled Project';
            const clientName = byId('clientName').value.trim();
            const values = {
                id: activeProjectId,
                user_id: currentUserId,
                project_name: projectName,
                client_name: clientName,
                project_data: project,
                updated_at: new Date().toISOString(),
            };
            const { error } = await _supabase.from('install_projects').upsert(values, { onConflict: 'id' });
            if (error) throw error;
            state.editorAcknowledged = stableStringify(project);
            alert('Install project saved.');
            await loadProjects();
        } catch (error) {
            console.error('Install project save failed:', error);
            alert(`Could not save the install project: ${error.message}`);
        } finally {
            if (savingSupport) {
                state.syncBusy = false;
                scheduleSupportPoll();
            }
            button.disabled = false;
            button.textContent = original;
        }
    };

    window.startNewProject = function () {
        if (state.support) {
            showError('liveSupportError', 'End live help before starting a different project.');
            return;
        }
        activeProjectId = makeId();
        for (const id of ['projName', 'projAddress', 'clientName', 'clientPhone',
            'installerName', 'installerPhone', 'projNotes']) byId(id).value = '';
        byId('zonesContainer').replaceChildren();
        zoneCounter = 0;
        window.addZone();
        updateGrandTotals();
        state.editorAcknowledged = stableStringify(window.packageProjectData());
        byId('editorScreen').inert = false;
        setView('editor');
    };

    window.backToProjects = async function () {
        if (state.support) {
            if (state.syncBusy) {
                alert('Live help is synchronizing. Please try again in a moment.');
                return;
            }
            clearTimeout(state.pollTimer);
            state.syncBusy = true;
            try {
                if (state.support.can_edit) {
                    await flushSupportProject();
                }
                const message = state.isOwner
                    ? 'Live Help is still open. Return to your project list and resume it later?'
                    : 'Leave the live help session? Acknowledged project changes remain saved.';
                if (!confirm(message)) return;
                await leaveSupport();
            } catch (error) {
                showError('liveSupportError', `Could not save before leaving: ${error.message}`);
                return;
            } finally {
                state.syncBusy = false;
                scheduleSupportPoll();
            }
        } else if (state.editorAcknowledged
            && stableStringify(window.packageProjectData()) !== state.editorAcknowledged
            && !confirm('Discard unsaved project edits and return to My Projects?')) {
            return;
        }
        await showProjects();
    };

    window.changeUserPage = async direction => {
        state.directoryOffset = Math.max(0, state.directoryOffset + direction * 20);
        try {
            await loadAdminDashboard();
        } catch (error) {
            showError('adminDashboardError', `Could not load users: ${error.message}`);
        }
    };

    async function loadPortal(user) {
        state.user = user;
        currentUserId = user.id;
        byId('userEmailDisplay').textContent = `Logged in as: ${user.email || ''}`;
        const { data: isAdmin, error } = await rpc('support_is_admin');
        if (state.user !== user) return;
        if (error) throw error;
        state.isAdmin = isAdmin === true;
        byId('authScreen').hidden = true;
        byId('appScreen').hidden = false;
        byId('appScreen').style.display = 'block';
        if (state.isAdmin) await window.showAdminDashboard();
        else await showProjects();
    }

    window.showAdminDashboard = async function () {
        if (state.view === 'editor') {
            await window.backToProjects();
            if (state.view !== 'projects') return;
        }
        setView('admin');
        try {
            await loadAdminDashboard();
        } catch (error) {
            showError('adminDashboardError', `Could not load the admin dashboard: ${error.message}`);
        }
    };

    window.signIn = async function () {
        showError('authError', '');
        const button = byId('signInButton');
        if (button.disabled) return;
        const tab = reservePortalTab();
        button.disabled = true;
        try {
            const { data, error } = await _supabase.auth.signInWithPassword({
                email: byId('email').value,
                password: byId('password').value,
            });
            if (error) throw error;
            if (launchPortalTab(tab)) {
                showEmbeddedContinue('The Install Portal opened in a separate tab.');
                return;
            }
            await loadPortal(data.user);
            if (embeddedPortal) alert('A new tab could not open. Continuing here instead.');
        } catch (error) {
            if (tab && !tab.closed) tab.close();
            window.showAuthError(`Could not finish sign-in: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    };

    window.continueInstallPortal = async function () {
        if (!embeddedPortal) return;
        showError('authError', '');
        const button = byId('continuePortalButton');
        if (button.disabled) return;
        button.disabled = true;
        const tab = reservePortalTab();
        try {
            const { data, error } = await _supabase.auth.getSession();
            if (error) throw error;
            if (!data.session || button.hidden) {
                if (tab && !tab.closed) tab.close();
                showEmbeddedCredentials();
                return;
            }
            if (launchPortalTab(tab)) return;
            await loadPortal(data.session.user);
            alert('A new tab could not open. Continuing here instead.');
        } catch (error) {
            if (tab && !tab.closed) tab.close();
            window.showAuthError(`Could not initialize the portal: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    };

    function showEmbeddedCredentials() {
        byId('authIntro').textContent = 'Log in to open your projects in a separate tab.';
        for (const id of ['email', 'password', 'signInButton', 'signUpButton']) byId(id).hidden = false;
        byId('continuePortalButton').hidden = true;
        byId('embeddedSignOutButton').hidden = true;
    }

    function showSignedOut() {
        clearTimeout(state.pollTimer);
        clearTimeout(state.searchTimer);
        state.user = null;
        state.support = null;
        state.isAdmin = false;
        state.isOwner = false;
        state.editorAcknowledged = '';
        currentUserId = null;
        activeProjectId = null;
        byId('email').value = '';
        byId('password').value = '';
        showError('authError', '');
        byId('authScreen').hidden = false;
        if (embeddedPortal) showEmbeddedCredentials();
        byId('appScreen').hidden = true;
        byId('appScreen').style.display = 'none';
    }

    window.signOut = async function () {
        if (state.syncBusy) {
            if (state.support) alert('Live help is synchronizing. Please try again in a moment.');
            return;
        }
        if (state.support && !confirm('Sign out of live help? Acknowledged changes remain saved; the owner can resume and end access.')) {
            return;
        }
        if (!state.support && state.view === 'editor' && state.editorAcknowledged
            && stableStringify(window.packageProjectData()) !== state.editorAcknowledged
            && !confirm('Discard unsaved project edits and sign out?')) {
            return;
        }
        clearTimeout(state.pollTimer);
        state.syncBusy = true;
        try {
            const { error } = await _supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
            showSignedOut();
        } catch (error) {
            alert(`Could not sign out: ${error.message}`);
        } finally {
            state.syncBusy = false;
            scheduleSupportPoll();
        }
    };

    _supabase.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') showSignedOut();
    });

    byId('directorySearch').addEventListener('input', () => {
        clearTimeout(state.searchTimer);
        state.directoryOffset = 0;
        state.searchTimer = setTimeout(() => {
            loadAdminDashboard().catch(error =>
                showError('adminDashboardError', `Could not search users: ${error.message}`));
        }, 250);
    });

    byId('liveSupportRoom').addEventListener('change', () => {
        state.supportZoneId = byId('liveSupportRoom').value;
        scrollToSupportZone(state.supportZoneId);
        scheduleSupportPoll();
    });

    window.onload = async function () {
        const { data, error } = await _supabase.auth.getSession();
        if (error) return window.showAuthError(`Could not check your sign-in: ${error.message}`);
        if (data.session) {
            if (embeddedPortal) {
                showEmbeddedContinue('You are signed in. Continue to open the Install Portal in a separate tab.');
                return;
            }
            try {
                await loadPortal(data.session.user);
            } catch (error) {
                window.showAuthError(`Could not initialize the portal: ${error.message}`);
            }
        } else {
            if (embeddedPortal) showEmbeddedCredentials();
            byId('appScreen').hidden = true;
            byId('authScreen').hidden = false;
        }
    };
})();
