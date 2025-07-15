class TaskDatabase {
    constructor() {
        this.dbName = 'EisenhowerMatrixDB';
        this.version = 1;
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    taskStore.createIndex('quadrant', 'quadrant', { unique: false });
                    taskStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('action', 'action', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('analytics')) {
                    db.createObjectStore('analytics', { keyPath: 'date' });
                }
            };
        });
    }

    async addTask(task) {
        return new Promise(async (resolve, reject) => {
            try {
                const transaction = this.db.transaction(['tasks'], 'readwrite');
                const store = transaction.objectStore('tasks');
                const request = store.add(task);
                
                request.onsuccess = async () => {
                    await this.addHistory('create', `Tarefa criada: ${task.name}`, task);
                    await this.updateAnalytics('taskCreated');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async updateTask(task) {
        return new Promise(async (resolve, reject) => {
            try {
                const transaction = this.db.transaction(['tasks'], 'readwrite');
                const store = transaction.objectStore('tasks');
                const request = store.put(task);
                
                request.onsuccess = async () => {
                    await this.addHistory('update', `Tarefa atualizada: ${task.name}`, task);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async deleteTask(taskId) {
        return new Promise(async (resolve, reject) => {
            try {
                const task = await this.getTask(taskId);
                const transaction = this.db.transaction(['tasks'], 'readwrite');
                const store = transaction.objectStore('tasks');
                const request = store.delete(taskId);
                
                request.onsuccess = async () => {
                    await this.addHistory('delete', `Tarefa excluída: ${task.name}`, task);
                    await this.updateAnalytics('taskDeleted');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async getTask(taskId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.get(taskId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getTasksByQuadrant(quadrant) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const index = store.index('quadrant');
            const request = index.getAll(quadrant);
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async addHistory(action, description, taskData = null) {
        return new Promise((resolve, reject) => {
            const historyEntry = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                action,
                description,
                taskData: taskData ? JSON.parse(JSON.stringify(taskData)) : null,
                timestamp: new Date().toISOString(),
                user: 'Squad Member'
            };
            
            const transaction = this.db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.add(historyEntry);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getHistory(limit = 50) {
        const transaction = this.db.transaction(['history'], 'readonly');
        const store = transaction.objectStore('history');
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev');
        
        return new Promise((resolve) => {
            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
        });
    }

    async clearHistory() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async updateAnalytics(action) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            const transaction = this.db.transaction(['analytics'], 'readwrite');
            const store = transaction.objectStore('analytics');
            
            const getRequest = store.get(today);
            getRequest.onsuccess = () => {
                let analytics = getRequest.result;
                if (!analytics) {
                    analytics = {
                        date: today,
                        tasksCreated: 0,
                        tasksCompleted: 0,
                        tasksDeleted: 0,
                        tasksMoved: 0
                    };
                }
                
                switch (action) {
                    case 'taskCreated':
                        analytics.tasksCreated++;
                        break;
                    case 'taskCompleted':
                        analytics.tasksCompleted++;
                        break;
                    case 'taskDeleted':
                        analytics.tasksDeleted++;
                        break;
                    case 'taskMoved':
                        analytics.tasksMoved++;
                        break;
                }
                
                const putRequest = store.put(analytics);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getAnalytics(days = 7) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['analytics'], 'readonly');
            const store = transaction.objectStore('analytics');
            const results = [];
            let completed = 0;
            
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                const request = store.get(dateStr);
                request.onsuccess = () => {
                    results[i] = request.result || { 
                        date: dateStr, 
                        tasksCreated: 0, 
                        tasksCompleted: 0, 
                        tasksDeleted: 0, 
                        tasksMoved: 0 
                    };
                    completed++;
                    if (completed === days) {
                        resolve(results.reverse());
                    }
                };
                request.onerror = () => reject(request.error);
            }
        });
    }
}

class EisenhowerMatrix {
    constructor() {
        this.db = new TaskDatabase();
        this.currentTaskId = null;
        this.currentView = 'matrix';
        this.init();
    }

    async init() {
        await this.db.init();
        this.bindEvents();
        this.renderTasks();
        this.setupDragAndDrop();
        this.setupTabs();
    }

    bindEvents() {
        document.getElementById('addTaskBtn').addEventListener('click', () => this.showAddTaskModal());
        document.getElementById('taskInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.showAddTaskModal();
        });

        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') this.closeModal();
        });

        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());
        document.getElementById('deleteTaskBtn').addEventListener('click', () => this.deleteTask());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                document.getElementById('taskInput').focus();
            }
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.id.replace('Tab', '');
                this.switchView(view);
            });
        });
    }

    switchView(view) {
        this.currentView = view;
        
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.classList.remove('active', 'text-compass-orange', 'border-compass-orange');
            tab.classList.add('text-white/60');
        });
        
        document.getElementById(`${view}Tab`).classList.add('active', 'text-compass-orange', 'border-compass-orange');
        document.getElementById(`${view}Tab`).classList.remove('text-white/60');
        
        document.querySelectorAll('.view-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        document.getElementById(`${view}View`).classList.remove('hidden');
        
        if (view === 'history') {
            this.renderHistory();
        } else if (view === 'analytics') {
            this.renderAnalytics();
        }
    }

    async showAddTaskModal() {
        const taskInput = document.getElementById('taskInput');
        const taskText = taskInput.value.trim();
        
        if (!taskText) {
            taskInput.focus();
            return;
        }

        this.currentTaskId = null;
        document.getElementById('editTaskInput').value = taskText;
        document.getElementById('editTaskDescription').value = '';
        document.getElementById('deleteTaskBtn').style.display = 'none';
        document.querySelector('#taskModal h3').textContent = 'Adicionar Nova Tarefa';
        
        this.showModal();
        taskInput.value = '';
    }

    async showEditTaskModal(taskId) {
        const task = await this.db.getTask(taskId);
        if (!task) return;

        this.currentTaskId = taskId;
        document.getElementById('editTaskInput').value = task.name;
        document.getElementById('editTaskDescription').value = task.description || '';
        document.getElementById('deleteTaskBtn').style.display = 'block';
        document.querySelector('#taskModal h3').textContent = 'Editar Tarefa';
        
        this.showModal();
    }

    showModal() {
        document.getElementById('taskModal').classList.remove('hidden');
        document.getElementById('editTaskInput').focus();
    }

    closeModal() {
        document.getElementById('taskModal').classList.add('hidden');
        this.currentTaskId = null;
    }

    async saveTask() {
        const name = document.getElementById('editTaskInput').value.trim();
        const description = document.getElementById('editTaskDescription').value.trim();

        if (!name) {
            document.getElementById('editTaskInput').focus();
            return;
        }

        if (this.currentTaskId) {
            const task = await this.db.getTask(this.currentTaskId);
            task.name = name;
            task.description = description;
            task.updatedAt = new Date().toISOString();
            await this.db.updateTask(task);
        } else {
            const newTask = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name,
                description,
                quadrant: 1,
                priority: 'medium',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completedAt: null
            };
            await this.db.addTask(newTask);
        }

        this.renderTasks();
        this.closeModal();
    }

    async deleteTask() {
        if (!this.currentTaskId) return;

        if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
            await this.db.deleteTask(this.currentTaskId);
            this.renderTasks();
            this.closeModal();
        }
    }

    async renderTasks() {
        const tasks = await this.db.getAllTasks();
        
        for (let i = 1; i <= 4; i++) {
            const quadrant = document.getElementById(`quadrant${i}`);
            quadrant.innerHTML = '';
            
            const quadrantTasks = tasks.filter(task => task.quadrant === i);
            
            quadrantTasks.forEach(task => {
                const taskElement = this.createTaskElement(task);
                quadrant.appendChild(taskElement);
            });
        }
        
        this.updateStats(tasks);
    }

    createTaskElement(task) {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item bg-white/10 p-4 rounded-xl border border-white/20 cursor-move transition-all hover:bg-white/20 hover:scale-105';
        taskDiv.draggable = true;
        taskDiv.dataset.taskId = task.id;

        const priorityColors = {
            high: 'bg-red-500',
            medium: 'bg-yellow-500',
            low: 'bg-green-500'
        };

        taskDiv.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                    <div class="font-semibold text-white mb-1">${task.name}</div>
                    ${task.description ? `<div class="text-white/70 text-sm">${task.description}</div>` : ''}
                </div>
                <div class="flex items-center gap-2 ml-2">
                    <div class="w-2 h-2 rounded-full ${priorityColors[task.priority] || 'bg-gray-500'}"></div>
                    <i class="fas fa-grip-vertical text-white/40"></i>
                </div>
            </div>
            <div class="flex items-center justify-between text-xs text-white/50">
                <span>${new Date(task.createdAt).toLocaleDateString('pt-BR')}</span>
                <span class="capitalize">${task.status}</span>
            </div>
        `;

        taskDiv.addEventListener('click', () => {
            this.showEditTaskModal(task.id);
        });

        return taskDiv;
    }

    updateStats(tasks) {
        const stats = {
            total: tasks.length,
            quadrant1: tasks.filter(t => t.quadrant === 1).length,
            quadrant2: tasks.filter(t => t.quadrant === 2).length,
            quadrant3: tasks.filter(t => t.quadrant === 3).length,
            quadrant4: tasks.filter(t => t.quadrant === 4).length
        };

        document.getElementById('totalTasks').textContent = stats.total;
        document.getElementById('urgentTasks').textContent = stats.quadrant1;
        document.getElementById('scheduledTasks').textContent = stats.quadrant2;
        document.getElementById('delegatedTasks').textContent = stats.quadrant3;
    }

    async renderHistory() {
        const history = await this.db.getHistory();
        const historyList = document.getElementById('historyList');
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="text-center text-white/60 py-8">Nenhuma atividade registrada</div>';
            return;
        }

        historyList.innerHTML = history.map(entry => {
            const date = new Date(entry.timestamp);
            const actionIcons = {
                create: 'fa-plus text-green-400',
                update: 'fa-edit text-blue-400',
                delete: 'fa-trash text-red-400',
                move: 'fa-arrows-alt text-yellow-400'
            };

            return `
                <div class="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                            <i class="fas ${actionIcons[entry.action] || 'fa-info text-white/60'}"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-white font-medium">${entry.description}</div>
                            <div class="text-white/60 text-sm">${date.toLocaleString('pt-BR')} • ${entry.user}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async renderAnalytics() {
        const analytics = await this.db.getAnalytics();
        const tasks = await this.db.getAllTasks();
        
        this.renderQuadrantChart(tasks);
        this.renderActivityChart(analytics);
    }

    renderQuadrantChart(tasks) {
        const quadrantData = [
            { name: 'Fazer Primeiro', count: tasks.filter(t => t.quadrant === 1).length, color: 'bg-red-500' },
            { name: 'Agendar', count: tasks.filter(t => t.quadrant === 2).length, color: 'bg-yellow-500' },
            { name: 'Delegar', count: tasks.filter(t => t.quadrant === 3).length, color: 'bg-blue-500' },
            { name: 'Eliminar', count: tasks.filter(t => t.quadrant === 4).length, color: 'bg-gray-500' }
        ];

        const total = quadrantData.reduce((sum, item) => sum + item.count, 0);
        const chartContainer = document.getElementById('quadrantChart');

        chartContainer.innerHTML = quadrantData.map(item => {
            const percentage = total > 0 ? (item.count / total * 100) : 0;
            return `
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-4 h-4 ${item.color} rounded"></div>
                        <span class="text-white">${item.name}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div class="${item.color} h-full transition-all duration-500" style="width: ${percentage}%"></div>
                        </div>
                        <span class="text-white/80 text-sm w-8">${item.count}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderActivityChart(analytics) {
        const chartContainer = document.getElementById('activityChart');
        const maxActivity = Math.max(...analytics.map(day => day.tasksCreated + day.tasksCompleted));

        chartContainer.innerHTML = analytics.map(day => {
            const total = day.tasksCreated + day.tasksCompleted;
            const height = maxActivity > 0 ? (total / maxActivity * 100) : 0;
            const date = new Date(day.date);

            return `
                <div class="flex items-end justify-between mb-2">
                    <div class="text-white/60 text-sm w-16">${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                    <div class="flex-1 mx-2 flex items-end h-8">
                        <div class="bg-compass-orange rounded-t transition-all duration-500" 
                             style="width: 100%; height: ${height}%"></div>
                    </div>
                    <div class="text-white/80 text-sm w-8">${total}</div>
                </div>
            `;
        }).join('');
    }

    async clearHistory() {
        if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
            await this.db.clearHistory();
            this.renderHistory();
        }
    }

    setupDragAndDrop() {
        const quadrants = document.querySelectorAll('.quadrant');
        
        quadrants.forEach(quadrant => {
            quadrant.addEventListener('dragover', this.handleDragOver.bind(this));
            quadrant.addEventListener('drop', this.handleDrop.bind(this));
            quadrant.addEventListener('dragenter', this.handleDragEnter.bind(this));
            quadrant.addEventListener('dragleave', this.handleDragLeave.bind(this));
        });

        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    handleDragStart(e) {
        if (!e.target.classList.contains('task-item')) return;
        
        e.target.classList.add('opacity-50', 'scale-105');
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragEnd(e) {
        if (!e.target.classList.contains('task-item')) return;
        
        e.target.classList.remove('opacity-50', 'scale-105');
        document.querySelectorAll('.quadrant').forEach(q => {
            q.classList.remove('ring-2', 'ring-compass-orange', 'bg-white/20');
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        if (e.target.classList.contains('quadrant') || e.target.closest('.quadrant')) {
            const quadrant = e.target.classList.contains('quadrant') ? e.target : e.target.closest('.quadrant');
            quadrant.classList.add('ring-2', 'ring-compass-orange', 'bg-white/20');
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('quadrant') && !e.target.contains(e.relatedTarget)) {
            e.target.classList.remove('ring-2', 'ring-compass-orange', 'bg-white/20');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        
        const taskId = e.dataTransfer.getData('text/plain');
        const quadrant = e.target.classList.contains('quadrant') ? e.target : e.target.closest('.quadrant');
        
        if (!quadrant || !taskId) return;

        const newQuadrant = parseInt(quadrant.dataset.quadrant);
        const task = await this.db.getTask(taskId);
        
        if (task && task.quadrant !== newQuadrant) {
            const oldQuadrant = task.quadrant;
            task.quadrant = newQuadrant;
            task.updatedAt = new Date().toISOString();
            
            await this.db.updateTask(task);
            await this.db.addHistory('move', `Tarefa movida do Q${oldQuadrant} para Q${newQuadrant}: ${task.name}`, task);
            await this.db.updateAnalytics('taskMoved');
            
            this.renderTasks();
        }

        quadrant.classList.remove('ring-2', 'ring-compass-orange', 'bg-white/20');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.eisenhowerMatrix = new EisenhowerMatrix();
});
