const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const api = {
  async getAllMemoDates() {
    try {
      const { data, error } = await supabase
        .from('daily_memos')
        .select('date')
        .neq('content', '');
      
      if (error) throw error;
      return (data || []).map(row => row.date);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getDailyMetrics(dateStr) {
    try {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select()
        .eq('date', dateStr)
        .maybeSingle();

      if (error) throw error;
      return data || { 
        contracts_count: '', 
        db_count: '', 
        saturday_visitors: '', 
        sunday_visitors: '' 
      };
    } catch (e) {
      console.error(e);
      return { contracts_count: '', db_count: '', saturday_visitors: '', sunday_visitors: '' };
    }
  },

  async saveDailyMetrics(dateStr, val) {
    try {
      const { error } = await supabase
        .from('daily_metrics')
        .upsert({
          date: dateStr,
          contracts_count: val.contracts_count ? parseInt(val.contracts_count) : null,
          db_count: val.db_count ? parseInt(val.db_count) : null,
          saturday_visitors: val.saturday_visitors ? parseInt(val.saturday_visitors) : null,
          sunday_visitors: val.sunday_visitors ? parseInt(val.sunday_visitors) : null,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async getDailyMemo(dateStr) {
    try {
      const { data, error } = await supabase
        .from('daily_memos')
        .select('content')
        .eq('date', dateStr)
        .maybeSingle();

      if (error) throw error;
      return data || { content: '' };
    } catch (e) {
      console.error(e);
      return { content: '' };
    }
  },

  async saveDailyMemo(dateStr, content) {
    try {
      const { error } = await supabase
        .from('daily_memos')
        .upsert({
          date: dateStr,
          content: content || '',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async addTaskWithDate(description, dueDate, taskDate) {
    try {
      const now = new Date();
      let createdAt = taskDate ? new Date(taskDate) : now;
      if (taskDate) {
        createdAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      }

      const { error } = await supabase
        .from('tasks')
        .insert({
          description: description,
          due_date: dueDate || null,
          created_at: createdAt.toISOString(),
          status: '진행중',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateTaskStatus(taskId, newStatus) {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateTaskContent(taskId, newDescription) {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          description: newDescription,
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async deleteTask(taskId) {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('task_id', taskId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async getTasksByPeriod(period) {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let s, e;

      switch (period) {
        case 'today': 
          s = today; 
          e = new Date(today.getTime() + 86400000); 
          break;
        case 'yesterday': 
          s = new Date(today.getTime() - 86400000); 
          e = today; 
          break;
        case 'tomorrow': 
          s = new Date(today.getTime() + 86400000); 
          e = new Date(today.getTime() + 2 * 86400000); 
          break;
        case 'week': 
          s = new Date(today.getTime() - 7 * 86400000); 
          e = new Date(today.getTime() + 86400000); 
          break;
        case 'month': 
          s = new Date(today.getTime() - 30 * 86400000); 
          e = new Date(today.getTime() + 86400000); 
          break;
        default: 
          s = today; 
          e = new Date(today.getTime() + 86400000);
      }

      const { data, error } = await supabase
        .from('tasks')
        .select()
        .gte('created_at', s.toISOString())
        .lt('created_at', e.toISOString());

      if (error) throw error;
      return this._sortTasks(data || []);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getTasksByDate(dateStr) {
    try {
      const targetDate = new Date(dateStr);
      const s = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const e = new Date(s.getTime() + 86400000);

      const { data, error } = await supabase
        .from('tasks')
        .select()
        .gte('created_at', s.toISOString())
        .lt('created_at', e.toISOString());

      if (error) throw error;
      return this._sortTasks(data || []);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async searchTasks(keyword) {
    try {
      if (!keyword) return [];
      
      const { data, error } = await supabase
        .from('tasks')
        .select()
        .ilike('description', `%${keyword}%`);

      if (error) throw error;
      return this._sortTasks(data || []);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  _sortTasks(tasks) {
    return tasks.sort((a, b) => 
      String(a.description).localeCompare(String(b.description), undefined, { numeric: true })
    );
  }
};
