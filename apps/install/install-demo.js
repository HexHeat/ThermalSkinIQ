(() => {
    'use strict';

    // Room areas and heater quantities from Example Home Layout, dated 2026-11-20.
    const models = {
        '220V 2x4': '78|0.35|220|8', '220V 2x6': '119|0.54|220|12',
        '220V 2x8': '160|0.73|220|16', '220V 2x10': '201|0.91|220|20',
        '220V 3x8': '245|1.12|220|24', '220V 3x10': '308|1.4|220|30',
    };
    const rooms = [
        ['Master Ensuite', 'Bathroom', 99, [['220V 2x6', 1], ['220V 2x8', 1]]],
        ['Master Bedroom', 'Master Bedroom', 156, [['220V 2x10', 2], ['220V 2x4', 3]]],
        ['Living, Kitchen, Dining', 'Other', 503, [
            ['220V 2x10', 2], ['220V 2x8', 2], ['220V 3x10', 3], ['220V 3x8', 4], ['220V 2x6', 1],
        ]],
        ['Bedroom 2', 'Other', 112, [['220V 2x10', 1], ['220V 2x6', 2]]],
        ['Bedroom 3', 'Other', 140, [['220V 3x8', 2], ['220V 2x4', 1], ['220V 2x6', 1]]],
    ];
    const byId = id => document.getElementById(id);
    const copy = data => JSON.parse(JSON.stringify(data));

    function exampleProject() {
        return {
            id: 'practice-example-home',
            project_data: {
                id: 'practice-example-home', projName: 'Example Home - Practice',
                projAddress: 'Anytown, AnyCity', clientName: '', clientPhone: '',
                installerName: '', installerPhone: '', projectDate: '2026-11-20',
                projNotes: 'PRACTICE ONLY. Recreated from the Example Home Layout report. Not an approved installation design.',
                layoutImport: { sourceLayoutProjectId: 'practice-layout-example-home',
                    totalFloorArea: 1010, totalHeatedArea: 474, importedAt: '2026-11-20T00:00:00Z' },
                zones: rooms.map(([name, roomType, roomSqft, inventory], index) => ({
                    id: `practice-room-${index + 1}`, layoutZoneName: `Zone ${index + 1} - ${name}`,
                    roomType, customRoomType: roomType === 'Other' ? name : '', roomSqft,
                    thermoType: 'UWG4 (Wifi) Class A 5ma 120/240V',
                    powerModuleType: 'USG/USG5 Class A 5ma GFCI 120/240V',
                    heaters: [],
                    layoutInventory: inventory.map(([model, qty]) => ({
                        name: model, heaterValue: models[model], qty,
                        sqftEach: Number(models[model].split('|')[3]),
                    })),
                })),
            },
        };
    }

    window.createInstallDemo = function (host) {
        let session = null;
        let printing = false;
        let reportStarted = false;
        const zone = index => document.querySelectorAll('#zonesContainer .zone-block')[index];
        const row = (index, number) => zone(index)?.querySelectorAll('.circuit-table-body tr')[number];
        const value = (element, selector) => element?.querySelector(selector)?.value;
        const hasCircuit = (z, r, circuit) => value(row(z, r), '.circuit-select') === circuit;
        const circuitFor = (z, r) => z === 2 && r === 4 ? '2' : '1';
        const assigned = (z, r, circuit = circuitFor(z, r)) => {
            const [model, qty] = rooms[z][3][r];
            return value(row(z, r), '.heater-select') === models[model] &&
                Number(value(row(z, r), '.qty-input')) === qty && hasCircuit(z, r, circuit);
        };
        const roomComplete = z => rooms[z][3].every((entry, r) => assigned(z, r)) &&
            zone(z)?.querySelectorAll('.circuit-table-body tr').length === rooms[z][3].length &&
            Number(value(zone(z), '.room-sqft')) === rooms[z][2] &&
            !zone(z)?.querySelector('.circuit-summaries .error');
        const complete = () => rooms.every((room, z) => roomComplete(z)) &&
            byId('gFloorArea').textContent === '1010.0 sq ft' &&
            byId('gHeatedArea').textContent === '474.0 sq ft' &&
            byId('gCoverage').textContent === '46.9%';
        const error = message => { byId('installDemoError').textContent = message; };

        function steps() {
            const result = [
                { kind: 'open', title: 'Open the copied Layout project',
                    text: 'Example Home is already uploaded for this lesson. Click Open Practice Project. You do not need to upload a real project.',
                    target: () => byId('openInstallDemoProject'), ready: () => false },
                { kind: 'details', title: 'Review project information',
                    text: 'The project name, date, address, room names, and floor areas came from Layout. Enter Demo Installer in Installer Name for this practice.',
                    target: () => byId('installerName'), ready: () => byId('installerName').value.trim() === 'Demo Installer' },
                { kind: 'controls', title: 'Choose a practice thermostat',
                    text: 'In Zone 1, open Thermostat Model and select UDG4 (non-wifi) Class A 5ma 120/240V. This is a training choice only.',
                    target: () => zone(0)?.querySelector('.thermostat-type'),
                    ready: () => value(zone(0), '.thermostat-type') === 'UDG4 (non-wifi) Class A 5ma 120/240V' },
            ];
            rooms.forEach(([name, roomType, area, inventory], z) => {
                result.push({ kind: 'review', title: `Zone ${z + 1}: ${name} holding area`,
                    text: `Review this room's imported ${area} sq ft and Unassigned Layout Heaters. Held heaters already count toward coverage, but not watts or amps. Click Next.`,
                    target: () => zone(z)?.querySelector('.layout-inventory'), ready: () => true });
                inventory.forEach(([model, qty], r) => {
                    if (r) result.push({ kind: 'add', title: `Zone ${z + 1}: Add a heater row`,
                        text: 'Click + Add Heater to Zone. Use a separate row for each different heater model.',
                        target: () => zone(z)?.querySelector('.add-btn'),
                        ready: () => !!row(z, r) });
                    result.push({ kind: 'assign', title: `Zone ${z + 1}: Assign ${model}`,
                        text: `In the outlined row, keep Circuit 1, choose ${model}, and set Qty to ${qty}. The matching held quantity leaves the holding area without increasing coverage.`,
                        target: () => row(z, r), ready: () => assigned(z, r, '1') });
                });
                if (z === 2) {
                    result.push({ kind: 'review', title: 'Read the circuit overload warning',
                        text: 'Zone 3 Circuit 1 now shows 12.50 A, above the app limit of 12 A. Do not ignore this warning. In the next practice step we will move the last 220V 2x6 row to a separate circuit.',
                        target: () => zone(z)?.querySelector('.warning-message'),
                        ready: () => zone(z)?.querySelector('.warning-message').textContent.includes('12.50A') });
                    result.push({ kind: 'fix', title: 'Move the extra heater to Circuit 2',
                        text: 'Change Circuit to 2 in the outlined 220V 2x6 row. Circuit 1 becomes 11.96 A and Circuit 2 becomes 0.54 A. These training allocations must not be used as approval for real wiring.',
                        target: () => row(z, 4)?.querySelector('.circuit-select'),
                        ready: () => assigned(z, 4) && roomComplete(z) });
                }
                result.push({ kind: 'review', title: `Zone ${z + 1}: Check circuits and controls`,
                    text: `All imported heaters in ${name} should now be assigned. Review watts, amps, and coverage. ${z === 2
                        ? 'Two active circuits produce one thermostat and one power module. Keep the practice USG/USG5 module selection.'
                        : 'One active circuit produces one thermostat and no extra power module.'} Click Next.`,
                    target: () => zone(z)?.querySelector('.materials-grid'), ready: () => roomComplete(z) });
            });
            result.push({ kind: 'review', title: 'Review the complete material takeoff',
                text: 'Check all five rooms: 1,010 sq ft floor, 474 sq ft heated, 46.9% coverage, 4,786 W, 21.76 A total, 26 heaters, 5 thermostats and 1 power module. Total project amps are not a single circuit load. All room warnings must be cleared.',
                target: () => byId('grandSummary'), ready: complete });
            result.push({ kind: 'save', title: 'Save the practice project',
                text: 'Click Save Practice Project. This keeps a separate report snapshot only until you exit or restart. A real project uses Save Project to Cloud.',
                target: () => byId('saveCloudBtn'), ready: () => false });
            result.push({ kind: 'print', title: 'Print or save the practice report',
                text: 'Click Print / Save as PDF. Use the browser print dialog to print or save a PDF. The report is marked PRACTICE ONLY.',
                target: () => document.querySelector('.print-btn'), ready: () => false });
            result.push({ kind: 'complete', title: 'Install demo complete',
                text: 'You opened a copied project, assigned its held heaters, checked circuits and controls, saved a practice snapshot, and opened the report. Exit to return to your real app, or restart.',
                target: () => null, ready: () => false });
            return result;
        }

        function render(scroll = true) {
            if (!session) return;
            document.querySelectorAll('.install-demo-target').forEach(element =>
                element.classList.remove('install-demo-target'));
            const step = session.steps[session.index];
            byId('installDemoGuide').dataset.kind = step.kind;
            byId('installDemoStep').textContent = `Step ${session.index + 1} of ${session.steps.length}: ${step.title}`;
            byId('installDemoInstruction').textContent = step.text;
            byId('installDemoCompletionStatus').hidden = step.kind !== 'complete';
            byId('retryInstallDemoCompletion').hidden = step.kind !== 'complete' || !session.completionError;
            byId('retryInstallDemoCompletion').disabled = !!session.completionBusy;
            byId('installDemoNext').disabled = printing || !step.ready();
            byId('installDemoBack').disabled = printing || session.index === 0;
            for (const id of ['installDemoRestart', 'installDemoExit']) byId(id).disabled = printing;
            const target = step.target();
            if (target) {
                target.classList.add('install-demo-target');
                if (scroll) target.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
        }

        function advance() {
            error('');
            session.index++;
            render();
            if (session.steps[session.index].kind === 'complete') saveCompletion();
        }

        async function saveCompletion() {
            if (!session || session.completionBusy || session.completionSaved ||
                session.steps[session.index].kind !== 'complete') return;
            const current = session;
            if (!current.userId) {
                byId('installDemoCompletionStatus').textContent =
                    'Sign in and complete this demo while signed in to unlock live help for your account.';
                return;
            }
            current.completionBusy = true;
            current.completionError = false;
            byId('installDemoCompletionStatus').textContent = 'Saving completion to your account...';
            render(false);
            try {
                await host.complete(current.userId);
                if (session !== current) return;
                current.completionSaved = true;
                byId('installDemoCompletionStatus').textContent =
                    'Completion saved to your account. Install live help is unlocked on all devices.';
            } catch (failure) {
                console.error('Saving Install demo completion failed:', failure);
                if (session !== current) return;
                current.completionError = true;
                byId('installDemoCompletionStatus').textContent =
                    `Could not save completion to your account: ${failure.message}. Please retry.`;
            } finally {
                current.completionBusy = false;
                if (session === current) render(false);
            }
        }

        function reset() {
            session.project = exampleProject();
            session.saved = null;
            session.index = 0;
            session.steps = steps();
            error('');
            host.showProject();
            byId('installDemoProject').hidden = false;
            render();
        }

        function cleanup(restore) {
            const previous = session;
            session = null;
            printing = false;
            reportStarted = false;
            document.body.classList.remove('install-demo-active');
            document.querySelectorAll('.install-demo-target').forEach(element =>
                element.classList.remove('install-demo-target'));
            byId('installDemoGuide').hidden = true;
            byId('installDemoProject').hidden = true;
            byId('installDemoPrintDisclaimer').hidden = true;
            byId('saveCloudBtn').textContent = previous.saveLabel;
            document.title = previous.title;
            window.removeEventListener('beforeprint', beforePrint);
            window.removeEventListener('afterprint', afterPrint);
            previous.restore(restore);
        }

        function beforePrint() {
            if (!session) return;
            printing = true;
            reportStarted = true;
            document.title = 'PRACTICE ONLY - Example Home Heater Installation Report';
            render(false);
        }

        function afterPrint() {
            if (!session) return;
            printing = false;
            document.title = session.title;
            if (reportStarted && session.steps[session.index].kind === 'print' && session.saved && complete()) advance();
            else render(false);
            reportStarted = false;
        }

        const api = {
            get active() { return session !== null; },
            start() {
                if (session) return;
                try {
                    const restore = host.begin();
                    session = { restore, title: document.title, saveLabel: byId('saveCloudBtn').textContent,
                        userId: host.userId() };
                    document.body.classList.add('install-demo-active');
                    byId('installDemoGuide').hidden = false;
                    byId('installDemoPrintDisclaimer').hidden = false;
                    byId('saveCloudBtn').textContent = 'Save Practice Project';
                    window.addEventListener('beforeprint', beforePrint);
                    window.addEventListener('afterprint', afterPrint);
                    reset();
                } catch (failure) {
                    console.error('Install demo could not start:', failure);
                    if (session) cleanup(true);
                    alert(`Could not start the guided demo: ${failure.message}`);
                }
            },
            exit() {
                if (!session || printing) return;
                if (confirm('Exit the demo and discard its practice project? Your real projects are untouched.')) cleanup(true);
            },
            discard() { if (session) cleanup(false); },
            save() {
                if (!session || printing) return;
                if (session.steps[session.index].kind !== 'save' || !complete()) {
                    error('Complete the guided room and circuit steps before saving the practice project.');
                    return;
                }
                session.saved = copy(window.packageProjectData());
                advance();
            },
            async print() {
                if (!session || printing) return;
                if (session.steps[session.index].kind !== 'print' || !session.saved ||
                    JSON.stringify(window.packageProjectData()) !== JSON.stringify(session.saved) || !complete()) {
                    error('Finish the lesson and save the practice project before printing its report.');
                    return;
                }
                printing = true;
                const printSession = session;
                render(false);
                try {
                    await document.fonts.ready;
                    if (session !== printSession) return;
                    window.print();
                } catch (failure) {
                    console.error('Practice Install printing failed:', failure);
                    if (session !== printSession) return;
                    printing = false;
                    reportStarted = false;
                    document.title = session.title;
                    error(`Could not open the practice report: ${failure.message}. Please retry.`);
                    render(false);
                }
            },
        };
        byId('openInstallDemoProject').addEventListener('click', () => {
            if (!session || printing) return;
            host.open(session.project);
            byId('installDemoProject').hidden = true;
            if (session.index === 0) advance();
            else render();
        });
        byId('installDemoNext').addEventListener('click', () => {
            if (session && !printing && session.steps[session.index].ready()) advance();
        });
        byId('installDemoBack').addEventListener('click', () => {
            if (!session || printing || session.index === 0) return;
            session.index--;
            error('');
            if (session.index === 0) {
                session.project = { id: 'practice-example-home',
                    project_data: copy(window.packageProjectData()) };
                host.showProject();
                byId('installDemoProject').hidden = false;
            } else if (byId('editorScreen').hidden) {
                host.open(session.saved || session.project);
                byId('installDemoProject').hidden = true;
            }
            render();
        });
        byId('installDemoRestart').addEventListener('click', () => {
            if (session && !printing && confirm('Restart and discard the practice project? Real projects are untouched.')) reset();
        });
        byId('installDemoExit').addEventListener('click', api.exit);
        byId('retryInstallDemoCompletion').addEventListener('click', saveCompletion);
        function onEdit(event) {
            if (!session || printing || !event.target.closest('#editorScreen')) return;
            session.saved = null;
            const step = session.steps[session.index];
            if (['details', 'controls', 'assign', 'fix'].includes(step.kind) && step.ready()) advance();
            else render(false);
        }
        document.addEventListener('input', onEdit);
        document.addEventListener('change', onEdit);
        document.addEventListener('click', event => {
            if (!session || printing) return;
            if (event.target.closest('.print-btn')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                api.print();
            }
        }, true);
        document.addEventListener('click', event => {
            if (!session || printing) return;
            const step = session.steps[session.index];
            if (step.kind === 'add' && event.target.closest('.add-btn') && step.ready()) advance();
        });
        return api;
    };
})();
