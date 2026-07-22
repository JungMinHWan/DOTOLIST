const SUPABASE_URL = 'https://xeawqnnugytabmaixrcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYXdxbm51Z3l0YWJtYWl4cmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMjk4NTksImV4cCI6MjA5MDkwNTg1OX0.KP98q2ZXDFd_DypgCx9eA0sC7IcS60D0LmOEFDhXFWM';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const api = {
  async getAllSecretLetterDates() {
    try {
      const { data, error } = await supabaseClient
        .from('vault')
        .select('key')
        .like('key', 'secret_letter_%')
        .neq('value', '');
      
      if (error) throw error;
      return (data || []).map(row => row.key.replace('secret_letter_', ''));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getSecretLetter(dateStr) {
    return this.getVaultValue(`secret_letter_${dateStr}`);
  },

  async saveSecretLetter(dateStr, content) {
    return this.saveVaultValue(`secret_letter_${dateStr}`, content);
  },

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
        cumulative_contracts_count: '',
        cumulative_db_count: '',
        saturday_visitors: '', 
        sunday_visitors: '',
        weekend_dress_orders: '',
        weekend_wedding_reservations: '',
        saturday_festa_dress_orders: '',
        sunday_festa_dress_orders: '',
        saturday_wedding_reservations: '',
        sunday_wedding_reservations: '',
        saturday_contracts_count: '',
        sunday_contracts_count: '',
        saturday_db_count: '',
        sunday_db_count: '',
        festa_company_1_name: '',
        festa_company_1_sat_orders: '',
        festa_company_1_sun_orders: '',
        festa_company_2_name: '',
        festa_company_2_sat_orders: '',
        festa_company_2_sun_orders: '',
        sat_wedding_visit_reservation: '',
        sat_wedding_actual_visit: '',
        sat_wedding_consultation: '',
        sat_wedding_provisional_contract: '',
        sat_wedding_regular_contract: '',
        sun_wedding_visit_reservation: '',
        sun_wedding_actual_visit: '',
        sun_wedding_consultation: '',
        sun_wedding_provisional_contract: '',
        sun_wedding_regular_contract: '',
        contract_top: '',
        contract_bottom: '',
        insight: '',
        saturday_wedding_text: '',
        sunday_wedding_text: '',
        saturday_honsoo_text: '',
        sunday_honsoo_text: ''
      };
    } catch (e) {
      console.error(e);
      return { 
        contracts_count: '', 
        db_count: '', 
        cumulative_contracts_count: '',
        cumulative_db_count: '',
        saturday_visitors: '', 
        sunday_visitors: '',
        weekend_dress_orders: '',
        weekend_wedding_reservations: '',
        saturday_festa_dress_orders: '',
        sunday_festa_dress_orders: '',
        saturday_wedding_reservations: '',
        sunday_wedding_reservations: '',
        saturday_contracts_count: '',
        sunday_contracts_count: '',
        saturday_db_count: '',
        sunday_db_count: '',
        festa_company_1_name: '',
        festa_company_1_sat_orders: '',
        festa_company_1_sun_orders: '',
        festa_company_2_name: '',
        festa_company_2_sat_orders: '',
        festa_company_2_sun_orders: '',
        sat_wedding_visit_reservation: '',
        sat_wedding_actual_visit: '',
        sat_wedding_consultation: '',
        sat_wedding_provisional_contract: '',
        sat_wedding_regular_contract: '',
        sun_wedding_visit_reservation: '',
        sun_wedding_actual_visit: '',
        sun_wedding_consultation: '',
        sun_wedding_provisional_contract: '',
        sun_wedding_regular_contract: '',
        contract_top: '',
        contract_bottom: '',
        insight: '',
        saturday_wedding_text: '',
        sunday_wedding_text: '',
        saturday_honsoo_text: '',
        sunday_honsoo_text: ''
      };
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
          cumulative_contracts_count: val.cumulative_contracts_count ? parseInt(val.cumulative_contracts_count) : null,
          cumulative_db_count: val.cumulative_db_count ? parseInt(val.cumulative_db_count) : null,
          saturday_visitors: val.saturday_visitors ? parseInt(val.saturday_visitors) : null,
          sunday_visitors: val.sunday_visitors ? parseInt(val.sunday_visitors) : null,
          weekend_dress_orders: val.weekend_dress_orders ? parseInt(val.weekend_dress_orders) : null,
          weekend_wedding_reservations: val.weekend_wedding_reservations ? parseInt(val.weekend_wedding_reservations) : null,
          saturday_festa_dress_orders: val.saturday_festa_dress_orders ? parseInt(val.saturday_festa_dress_orders) : null,
          sunday_festa_dress_orders: val.sunday_festa_dress_orders ? parseInt(val.sunday_festa_dress_orders) : null,
          saturday_wedding_reservations: val.saturday_wedding_reservations ? parseInt(val.saturday_wedding_reservations) : null,
          sunday_wedding_reservations: val.sunday_wedding_reservations ? parseInt(val.sunday_wedding_reservations) : null,
          saturday_contracts_count: val.saturday_contracts_count ? parseInt(val.saturday_contracts_count) : null,
          sunday_contracts_count: val.sunday_contracts_count ? parseInt(val.sunday_contracts_count) : null,
          saturday_db_count: val.saturday_db_count ? parseInt(val.saturday_db_count) : null,
          sunday_db_count: val.sunday_db_count ? parseInt(val.sunday_db_count) : null,
          festa_company_1_name: val.festa_company_1_name || '',
          festa_company_1_sat_orders: val.festa_company_1_sat_orders ? parseInt(val.festa_company_1_sat_orders) : null,
          festa_company_1_sun_orders: val.festa_company_1_sun_orders ? parseInt(val.festa_company_1_sun_orders) : null,
          festa_company_2_name: val.festa_company_2_name || '',
          festa_company_2_sat_orders: val.festa_company_2_sat_orders ? parseInt(val.festa_company_2_sat_orders) : null,
          festa_company_2_sun_orders: val.festa_company_2_sun_orders ? parseInt(val.festa_company_2_sun_orders) : null,
          sat_wedding_visit_reservation: val.sat_wedding_visit_reservation ? parseInt(val.sat_wedding_visit_reservation) : null,
          sat_wedding_actual_visit: val.sat_wedding_actual_visit ? parseInt(val.sat_wedding_actual_visit) : null,
          sat_wedding_consultation: val.sat_wedding_consultation ? parseInt(val.sat_wedding_consultation) : null,
          sat_wedding_provisional_contract: val.sat_wedding_provisional_contract ? parseInt(val.sat_wedding_provisional_contract) : null,
          sat_wedding_regular_contract: val.sat_wedding_regular_contract ? parseInt(val.sat_wedding_regular_contract) : null,
          sun_wedding_visit_reservation: val.sun_wedding_visit_reservation ? parseInt(val.sun_wedding_visit_reservation) : null,
          sun_wedding_actual_visit: val.sun_wedding_actual_visit ? parseInt(val.sun_wedding_actual_visit) : null,
          sun_wedding_consultation: val.sun_wedding_consultation ? parseInt(val.sun_wedding_consultation) : null,
          sun_wedding_provisional_contract: val.sun_wedding_provisional_contract ? parseInt(val.sun_wedding_provisional_contract) : null,
          sun_wedding_regular_contract: val.sun_wedding_regular_contract ? parseInt(val.sun_wedding_regular_contract) : null,
          contract_top: val.contract_top || '',
          contract_bottom: val.contract_bottom || '',
          insight: val.insight || '',
           saturday_wedding_text: val.saturday_wedding_text || '',
          sunday_wedding_text: val.sunday_wedding_text || '',
          saturday_honsoo_text: val.saturday_honsoo_text || '',
          sunday_honsoo_text: val.sunday_honsoo_text || '',
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

      // 해당 일자의 기존 태스크들을 조회해 가장 작은 sort_order 값을 찾음 (상단에 띄우기 위해)
      const s = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
      const e = new Date(s.getTime() + 86400000);
      
      const { data: existingTasks, error: fetchError } = await supabaseClient
        .from('tasks')
        .select('sort_order')
        .gte('created_at', s.toISOString())
        .lt('created_at', e.toISOString());
        
      let nextOrder = 1;
      if (!fetchError && existingTasks && existingTasks.length > 0) {
        const orders = existingTasks.map(t => t.sort_order !== undefined && t.sort_order !== null ? t.sort_order : 0);
        nextOrder = Math.min(...orders) - 1;
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
  },

  // 📚 독서 기록 관련 API 추가
  async getBooks() {
    try {
      const { data, error } = await supabaseClient
        .from('books')
        .select()
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async addBook(title) {
    try {
      const { data, error } = await supabaseClient
        .from('books')
        .insert({ title: title, status: '읽는 중', notes: '' })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateBookStatus(bookId, newStatus) {
    try {
      const { error } = await supabaseClient
        .from('books')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('book_id', bookId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateBookNotes(bookId, newNotes) {
    try {
      const { error } = await supabaseClient
        .from('books')
        .update({ notes: newNotes, updated_at: new Date().toISOString() })
        .eq('book_id', bookId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateBookTitle(bookId, newTitle) {
    try {
      const { error } = await supabaseClient
        .from('books')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('book_id', bookId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async deleteBook(bookId) {
    try {
      const { error } = await supabaseClient
        .from('books')
        .delete()
        .eq('book_id', bookId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  // 📋 업무 매뉴얼 관련 API 추가
  async getManuals() {
    try {
      const { data, error } = await supabaseClient
        .from('manuals')
        .select()
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async addManual(title) {
    try {
      const { data, error } = await supabaseClient
        .from('manuals')
        .insert({ title: title, status: '참고 중', notes: '' })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateManualStatus(manualId, newStatus) {
    try {
      const { error } = await supabaseClient
        .from('manuals')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('manual_id', manualId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateManualNotes(manualId, newNotes) {
    try {
      const { error } = await supabaseClient
        .from('manuals')
        .update({ notes: newNotes, updated_at: new Date().toISOString() })
        .eq('manual_id', manualId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async updateManualTitle(manualId, newTitle) {
    try {
      const { error } = await supabaseClient
        .from('manuals')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('manual_id', manualId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async deleteManual(manualId) {
    try {
      const { error } = await supabaseClient
        .from('manuals')
        .delete()
        .eq('manual_id', manualId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async getVaultValue(key) {
    try {
      const { data, error } = await supabaseClient
        .from('vault')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;
      return data ? data.value : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  async saveVaultValue(key, value) {
    try {
      const { error } = await supabaseClient
        .from('vault')
        .upsert({
          key: key,
          value: value,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  // === 게이미피케이션 & 일일 미션 API ===

  // 1. 사용자 스탯 가져오기 (없으면 새로 생성)
  async getUserStats() {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const { data, error } = await supabaseClient
        .from('user_stats')
        .select()
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        const { data: newStats, error: insertError } = await supabaseClient
          .from('user_stats')
          .insert({ user_id: user.id, level: 1, xp: 0 })
          .select()
          .single();

        if (insertError) throw insertError;
        return newStats;
      }
      return data;
    } catch (e) {
      console.error("getUserStats error:", e);
      return { level: 1, xp: 0 };
    }
  },

  // 2. 특정 날짜의 일일 미션 현황 조회 (없으면 기본값 생성)
  async getDailyQuestStatus(dateStr) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const { data, error } = await supabaseClient
        .from('daily_quest_status')
        .select()
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // 오늘 날짜의 미션 진행도가 없으면 새로 생성
        const targetDate = new Date(dateStr);
        const s = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const e = new Date(s.getTime() + 86400000);
        
        const { count, error: countError } = await supabaseClient
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('status', '완료')
          .gte('created_at', s.toISOString())
          .lt('created_at', e.toISOString());

        const [{data: memo}, {data: diary}, {data: news}] = await Promise.all([
          supabaseClient.from('daily_memos').select('content').eq('date', dateStr).maybeSingle(),
          supabaseClient.from('daily_diaries').select('content').eq('date', dateStr).maybeSingle(),
          supabaseClient.from('daily_news').select('content').eq('date', dateStr).maybeSingle()
        ]);

        const memoWritten = !!(memo && memo.content && memo.content.trim().length > 0);
        const diaryWritten = !!(diary && diary.content && diary.content.trim().length > 0);
        const newsWritten = !!(news && news.content && news.content.trim().length > 0);

        const { data: newQuest, error: insertError } = await supabaseClient
          .from('daily_quest_status')
          .insert({
            user_id: user.id,
            date: dateStr,
            completed_tasks_count: countError ? 0 : (count || 0),
            memo_written: memoWritten,
            diary_written: diaryWritten,
            news_written: newsWritten,
            book_logged: false,
            metrics_logged: false
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newQuest;
      }
      return data;
    } catch (e) {
      console.error("getDailyQuestStatus error:", e);
      return null;
    }
  },

  // 3. 일일 미션 진행도 업데이트
  async updateQuestProgress(dateStr, field, value) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const prevStatus = await this.getDailyQuestStatus(dateStr);
      const prevVal = prevStatus ? prevStatus[field] : null;

      const updateData = { updated_at: new Date().toISOString() };
      updateData[field] = value;

      const { data, error } = await supabaseClient
        .from('daily_quest_status')
        .update(updateData)
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .select()
        .single();

      if (error) throw error;

      let xpAdded = 0;
      let leveledUp = false;
      let stats = null;

      // 메모, 일기, 신문 최초 기록 시 10 XP 지급
      if (['memo_written', 'diary_written', 'news_written'].includes(field)) {
        if (!prevVal && value === true) {
          const xpRes = await this._addXp(user.id, 10);
          if (xpRes.success) {
            xpAdded = 10;
            stats = xpRes.stats;
            leveledUp = xpRes.leveledUp;
          }
        }
      }

      return { success: true, data, xpAdded, stats, leveledUp };
    } catch (e) {
      console.error("updateQuestProgress error:", e);
      return { success: false, error: e.message };
    }
  },

  // 4. 할 일 완료 개수 갱신
  async updateCompletedTasksQuestCount(dateStr) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const targetDate = new Date(dateStr);
      const s = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const e = new Date(s.getTime() + 86400000);

      const { count, error: countError } = await supabaseClient
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', '완료')
        .gte('created_at', s.toISOString())
        .lt('created_at', e.toISOString());

      if (countError) throw countError;

      return await this.updateQuestProgress(dateStr, 'completed_tasks_count', count || 0);
    } catch (e) {
      console.error("updateCompletedTasksQuestCount error:", e);
      return { success: false, error: e.message };
    }
  },

  // 5. 미션 완료 및 보상 처리
  async claimQuestReward(dateStr, questNum, rewardXp) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const questField = `quest_${questNum}_completed`;
      const updateQuest = { updated_at: new Date().toISOString() };
      updateQuest[questField] = true;

      const { error: questError } = await supabaseClient
        .from('daily_quest_status')
        .update(updateQuest)
        .eq('user_id', user.id)
        .eq('date', dateStr);

      if (questError) throw questError;

      return await this._addXp(user.id, rewardXp);
    } catch (e) {
      console.error("claimQuestReward error:", e);
      return { success: false, error: e.message };
    }
  },

  // 6. 올 클리어 보상 처리
  async claimAllClearReward(dateStr, rewardXp) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");

      const { error: questError } = await supabaseClient
        .from('daily_quest_status')
        .update({
          all_clear_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('date', dateStr);

      if (questError) throw questError;

      return await this._addXp(user.id, rewardXp);
    } catch (e) {
      console.error("claimAllClearReward error:", e);
      return { success: false, error: e.message };
    }
  },

  // 7. 실시간 할 일 완료/취소 경험치 처리 (+2 XP / -2 XP)
  async addRealtimeTaskXp(xpAmount) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");
      
      // 만약 음수 경험치를 차감하더라도 0 이하로 떨어지지 않도록 addXp에서 자동 처리
      return await this._addXp(user.id, xpAmount);
    } catch (e) {
      console.error("addRealtimeTaskXp error:", e);
      return { success: false, error: e.message };
    }
  },

  // 내부 경험치 가산 공통 함수
  async _addXp(userId, xpToAdd) {
    const { data: stats, error: statsError } = await supabaseClient
      .from('user_stats')
      .select()
      .eq('user_id', userId)
      .single();

    if (statsError) throw statsError;

    let newXp = stats.xp + xpToAdd;
    let newLevel = stats.level;
    let leveledUp = false;

    while (true) {
      const requiredXp = newLevel * 100;
      if (newXp >= requiredXp) {
        newXp -= requiredXp;
        newLevel += 1;
        leveledUp = true;
      } else {
        break;
      }
    }

    const { data: updatedStats, error: updateError } = await supabaseClient
      .from('user_stats')
      .update({
        level: newLevel,
        xp: newXp,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    return { success: true, stats: updatedStats, leveledUp };
  },

  // === 예약 알림 푸시 API ===
  async updateTaskPushTime(taskId, pushTime) {
    try {
      const { error } = await supabaseClient
        .from('tasks')
        .update({
          push_time: pushTime || null,
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

  async savePushSubscription(subscription) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");
      
      const endpoint = subscription.endpoint;
      
      // 1. 이미 존재하는 구독인지 확인을 위해 목록 조회
      const { data: list, error: listError } = await supabaseClient
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', user.id);
        
      if (listError) throw listError;
      
      const match = (list || []).find(item => item.subscription && item.subscription.endpoint === endpoint);
      
      if (match) {
        // 이미 존재하므로 업데이트
        const { error: updateErr } = await supabaseClient
          .from('push_subscriptions')
          .update({
            subscription: subscription,
            updated_at: new Date().toISOString()
          })
          .eq('id', match.id);
        if (updateErr) throw updateErr;
      } else {
        // 새로운 구독 추가
        const { error: insertErr } = await supabaseClient
          .from('push_subscriptions')
          .insert({
            user_id: user.id,
            subscription: subscription
          });
        if (insertErr) throw insertErr;
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  async deletePushSubscription(endpoint) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인된 사용자가 없습니다.");
      
      const { data: list, error: listError } = await supabaseClient
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', user.id);
        
      if (listError) throw listError;
      
      const match = (list || []).find(item => item.subscription && item.subscription.endpoint === endpoint);
      if (match) {
        const { error: deleteErr } = await supabaseClient
          .from('push_subscriptions')
          .delete()
          .eq('id', match.id);
        if (deleteErr) throw deleteErr;
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  },

  // === 백칸 수학 API ===
  async saveMathScore(playerName, operation, score, elapsedSeconds, mistakes) {
    try {
      let userId = null;
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) userId = user.id;
      } catch (_) {}

      const { error } = await supabaseClient
        .from('math_scores')
        .insert({
          player_name: playerName || '무명',
          operation: operation,
          score: parseInt(score) || 0,
          elapsed_time: parseInt(elapsedSeconds) || 0,
          mistakes: parseInt(mistakes) || 0,
          user_id: userId
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error('saveMathScore error:', e);
      return { success: false, error: e.message };
    }
  },

  async getTopMathScores(operation, limit = 10) {
    try {
      let query = supabaseClient
        .from('math_scores')
        .select('*');

      if (operation) {
        query = query.eq('operation', operation);
      }

      // 점수(score) 내림차순, 소요시간(elapsed_time) 오름차순, 실수(mistakes) 오름차순
      const { data, error } = await query
        .order('score', { ascending: false })
        .order('elapsed_time', { ascending: true })
        .order('mistakes', { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('getTopMathScores error:', e);
      return [];
    }
  },

  // === 📚 독서 지식·어휘 (user_book_vocab) API ===
  async getUserBookVocab() {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) return [];

      const { data, error } = await supabaseClient
        .from('user_book_vocab')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('getUserBookVocab error:', e);
      return [];
    }
  },

  async saveBookVocab(vocabObj) {
    try {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) throw new Error("로그인이 필요합니다.");

      const payload = {
        user_id: user.id,
        book_id: vocabObj.book_id || null,
        book_title: vocabObj.book_title || '',
        keyword: vocabObj.keyword,
        category: vocabObj.category || '어휘',
        short_summary: vocabObj.short_summary || '',
        full_description: vocabObj.full_description || '',
        related_tags: vocabObj.related_tags || [],
        mastery_level: vocabObj.mastery_level || 0,
        updated_at: new Date().toISOString()
      };

      if (vocabObj.id) {
        // Update
        const { data, error } = await supabaseClient
          .from('user_book_vocab')
          .update(payload)
          .eq('id', vocabObj.id)
          .select()
          .single();
        if (error) throw error;
        return { success: true, data };
      } else {
        // Insert
        const { data, error } = await supabaseClient
          .from('user_book_vocab')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return { success: true, data };
      }
    } catch (e) {
      console.error('saveBookVocab error:', e);
      return { success: false, error: e.message };
    }
  },

  async updateVocabMastery(id, isCorrect) {
    try {
      const { data: current, error: fetchErr } = await supabaseClient
        .from('user_book_vocab')
        .select('mastery_level, correct_count, wrong_count')
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      let correctCount = (current.correct_count || 0) + (isCorrect ? 1 : 0);
      let wrongCount = (current.wrong_count || 0) + (isCorrect ? 0 : 1);
      let masteryLevel = current.mastery_level || 0;

      if (isCorrect) {
        if (correctCount >= 3) masteryLevel = 2; // 완전 습득
        else if (correctCount >= 1) masteryLevel = 1; // 복습 중
      } else {
        if (masteryLevel > 0 && wrongCount >= 2) masteryLevel = 1; // 강등
      }

      const { data, error } = await supabaseClient
        .from('user_book_vocab')
        .update({
          correct_count: correctCount,
          wrong_count: wrongCount,
          mastery_level: masteryLevel,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      console.error('updateVocabMastery error:', e);
      return { success: false, error: e.message };
    }
  },

  async deleteBookVocab(id) {
    try {
      const { error } = await supabaseClient
        .from('user_book_vocab')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error('deleteBookVocab error:', e);
      return { success: false, error: e.message };
    }
  }
};

