const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const api = {
  async getAllMemoDates() {
    try {
      const { data, error } = await supabaseClient
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

  async getAllDiaryDates() {
    try {
      const { data, error } = await supabaseClient
        .from('daily_diaries')
        .select('date')
        .neq('content', '');
      
      if (error) throw error;
      return (data || []).map(row => row.date);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getAllNewsDates() {
    try {
      const { data, error } = await supabaseClient
        .from('daily_news')
        .select('date')
        .neq('content', '');
      
      if (error) throw error;
      return (data || []).map(row => row.date);
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getDailyDiary(dateStr) {
    try {
      const { data, error } = await supabaseClient
        .from('daily_diaries')
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

  async saveDailyDiary(dateStr, content) {
    try {
      const { error } = await supabaseClient
        .from('daily_diaries')
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

  async getDailyNews(dateStr) {
    try {
      const { data, error } = await supabaseClient
        .from('daily_news')
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

  async saveDailyNews(dateStr, content) {
    try {
      const { error } = await supabaseClient
        .from('daily_news')
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

  async getDailyMetrics(dateStr) {
    try {
      const { data, error } = await supabaseClient
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
      const { error } = await supabaseClient
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
      const { data, error } = await supabaseClient
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
      const { error } = await supabaseClient
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

      // 해당 일자의 기존 태스크들을 조회해 가장 큰 sort_order 값을 찾음
      const s = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
      const e = new Date(s.getTime() + 86400000);
      
      const { data: existingTasks, error: fetchError } = await supabaseClient
        .from('tasks')
        .select('sort_order')
        .gte('created_at', s.toISOString())
        .lt('created_at', e.toISOString());
        
      let nextOrder = 1;
      if (!fetchError && existingTasks && existingTasks.length > 0) {
        const orders = existingTasks.map(t => t.sort_order || 0);
        nextOrder = Math.max(...orders) + 1;
      }

      const { error } = await supabaseClient
        .from('tasks')
        .insert({
          description: description,
          due_date: dueDate || null,
          created_at: createdAt.toISOString(),
          status: '진행중',
          sort_order: nextOrder,
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
      const { error } = await supabaseClient
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
      const { error } = await supabaseClient
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
      const { error } = await supabaseClient
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

      const { data, error } = await supabaseClient
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

      const { data, error } = await supabaseClient
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
      
      const { data, error } = await supabaseClient
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

  async updateTasksOrder(taskIds) {
    try {
      if (!taskIds || taskIds.length === 0) return { success: true };
      
      const promises = taskIds.map((id, index) => 
        supabaseClient
          .from('tasks')
          .update({
            sort_order: index + 1,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', id)
      );
      
      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw errors[0].error;
      
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  _sortTasks(tasks) {
    return tasks.sort((a, b) => {
      const orderA = a.sort_order !== undefined && a.sort_order !== null ? a.sort_order : 999999;
      const orderB = b.sort_order !== undefined && b.sort_order !== null ? b.sort_order : 999999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });
  },

  // Goal & Execution List API
  async getGoal() {
    try {
      const { data, error } = await supabaseClient
        .from('goals')
        .select()
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  async updateGoal(id, text) {
    try {
      const { error } = await supabaseClient
        .from('goals')
        .update({ text, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async getGoalExecutions(goalId) {
    try {
      const { data, error } = await supabaseClient
        .from('goal_executions')
        .select()
        .eq('goal_id', goalId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async addGoalExecution(goalId, text) {
    try {
      const { data, error } = await supabaseClient
        .from('goal_executions')
        .insert({ goal_id: goalId, text: text })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async toggleGoalExecution(id, isCompleted) {
    try {
      const { error } = await supabaseClient
        .from('goal_executions')
        .update({ is_completed: isCompleted, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async deleteGoalExecution(id) {
    try {
      const { error } = await supabaseClient
        .from('goal_executions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  }
};
