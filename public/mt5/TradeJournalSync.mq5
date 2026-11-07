//+------------------------------------------------------------------+
//| TradeJournalSync.mq5                                            |
//| Sends your closed MT5 positions to your trade journal.    |
//|                                                                  |
//| It never opens, changes or closes trades. It only reads history.  |
//|                                                                  |
//| Setup:                                                           |
//|  1. Tools > Options > Expert Advisors:                            |
//|     tick "Allow WebRequest for listed URL" and add your journal   |
//|     address, e.g. https://your-journal.vercel.app                          |
//|  2. Drag this EA onto any one chart. Paste the Sync URL and Key   |
//|     from the journal (Settings > MT5 sync).                       |
//|  3. Turn on "Algo Trading" in the toolbar.                        |
//+------------------------------------------------------------------+
#property copyright "1birr Trade"
#property version   "1.00"
#property description "Syncs closed positions to your trade journal. Read-only: it never places or changes trades."

input string JournalSyncURL   = "https://your-journal.vercel.app/api/sync"; // Sync URL (from journal Settings)
input string SyncKey          = "";                                      // Sync key (from journal Settings)
input int    FirstSyncDays    = 90;                                      // Days of history on the first sync
input int    SyncEveryMinutes = 5;                                       // Regular sync interval (minutes)

string   g_gvLast;        // global variable that remembers the last synced close time
bool     g_pending = false;
datetime g_lastRun = 0;
string   g_status  = "Starting...";

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(SyncKey) < 10)
     {
      Alert("Trade Journal Sync: paste your Sync key from the journal (Settings > MT5 sync).");
      return(INIT_PARAMETERS_INCORRECT);
     }
   g_gvLast = "WTJ_last_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   EventSetTimer(30);
   g_pending = true;            // sync right away
   OnTimer();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

// A deal was added (a trade opened/closed): sync on the next timer tick.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      g_pending = true;
  }

void OnTimer()
  {
   if(!g_pending && TimeLocal() - g_lastRun < SyncEveryMinutes * 60)
      return;
   g_pending = false;
   g_lastRun = TimeLocal();
   SyncNow();
   Comment("Trade Journal Sync\n", g_status);
  }

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
// Broker server time minus UTC, rounded to 15 minutes.
long ServerOffsetSeconds()
  {
   long off = (long)(TimeTradeServer() - TimeGMT());
   return (long)MathRound(off / 900.0) * 900;
  }

string JsonEscape(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
  }

string Num(double v, int digits)
  {
   return DoubleToString(v, digits);
  }

bool InList(const ulong &arr[], ulong v)
  {
   for(int i = 0; i < ArraySize(arr); i++)
      if(arr[i] == v) return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Build one position as JSON. Returns "" if it is not fully closed. |
//+------------------------------------------------------------------+
string PositionJson(ulong posId, long offset, datetime &closeTimeOut)
  {
   if(!HistorySelectByPosition(posId))
      return "";

   string   symbol = "";
   string   side   = "";
   double   volIn = 0, volOut = 0, openPrice = 0, closePrice = 0, sl = 0, tp = 0, net = 0;
   datetime openTime = 0, closeTime = 0;

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long type = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;

      long     entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      double   vol   = HistoryDealGetDouble(deal, DEAL_VOLUME);
      double   price = HistoryDealGetDouble(deal, DEAL_PRICE);
      datetime t     = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);

      net += HistoryDealGetDouble(deal, DEAL_PROFIT)
           + HistoryDealGetDouble(deal, DEAL_SWAP)
           + HistoryDealGetDouble(deal, DEAL_COMMISSION)
           + HistoryDealGetDouble(deal, DEAL_FEE);

      if(entry == DEAL_ENTRY_IN)
        {
         if(openTime == 0 || t < openTime)
           {
            openTime  = t;
            symbol    = HistoryDealGetString(deal, DEAL_SYMBOL);
            side      = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
           }
         openPrice = (openPrice * volIn + price * vol) / (volIn + vol); // average entry
         volIn    += vol;
         if(sl == 0) sl = HistoryDealGetDouble(deal, DEAL_SL);
         if(tp == 0) tp = HistoryDealGetDouble(deal, DEAL_TP);
        }
      else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
        {
         volOut += vol;
         if(t >= closeTime)
           {
            closeTime  = t;
            closePrice = price;
           }
         double dsl = HistoryDealGetDouble(deal, DEAL_SL);
         double dtp = HistoryDealGetDouble(deal, DEAL_TP);
         if(sl == 0 && dsl > 0) sl = dsl;
         if(tp == 0 && dtp > 0) tp = dtp;
        }
     }

   if(openTime == 0 || closeTime == 0 || volIn <= 0) return "";
   if(volOut + 1e-8 < volIn) return "";              // still partly open: wait until fully closed

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   if(digits <= 0) digits = 5;

   // money at risk = loss if the stop loss had been hit
   double risk = 0;
   if(sl > 0)
     {
      double loss = 0;
      ENUM_ORDER_TYPE ot = (side == "buy") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(OrderCalcProfit(ot, symbol, volIn, openPrice, sl, loss) && loss < 0)
         risk = -loss;
     }

   closeTimeOut = closeTime;
   string j = "{";
   j += "\"position\":\"" + IntegerToString((long)posId) + "\",";
   j += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
   j += "\"type\":\"" + side + "\",";
   j += "\"volume\":" + Num(volIn, 2) + ",";
   j += "\"open_time\":" + IntegerToString((long)openTime - offset) + ",";
   j += "\"close_time\":" + IntegerToString((long)closeTime - offset) + ",";
   j += "\"open_price\":" + Num(openPrice, digits) + ",";
   j += "\"close_price\":" + Num(closePrice, digits) + ",";
   j += "\"sl\":" + Num(sl, digits) + ",";
   j += "\"tp\":" + Num(tp, digits) + ",";
   j += "\"risk\":" + Num(risk, 2) + ",";
   j += "\"profit\":" + Num(net, 2);
   j += "}";
   return j;
  }

//+------------------------------------------------------------------+
//| Send one batch. Returns true on success.                          |
//+------------------------------------------------------------------+
bool Post(string body, string &reply)
  {
   char data[], res[];
   string resHeaders;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) ArrayResize(data, n - 1);                // drop the trailing \0
   string headers = "Content-Type: application/json\r\nX-Api-Key: " + SyncKey + "\r\n";

   ResetLastError();
   int code = WebRequest("POST", JournalSyncURL, headers, 15000, data, res, resHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         g_status = "Blocked by MT5. Add your journal address in Tools > Options > Expert Advisors > Allow WebRequest.";
      else
         g_status = "Cannot reach the journal (error " + IntegerToString(err) + "). Check the Sync URL and your internet.";
      Print("Trade Journal Sync: ", g_status);
      return false;
     }
   reply = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   if(code != 200)
     {
      g_status = "Journal answered " + IntegerToString(code) + ": " + reply;
      Print("Trade Journal Sync: ", g_status);
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
void SyncNow()
  {
   datetime now  = TimeCurrent();
   datetime from = now - (datetime)(FirstSyncDays * 86400);
   if(GlobalVariableCheck(g_gvLast))
     {
      datetime last = (datetime)GlobalVariableGet(g_gvLast);
      if(last > from) from = last - 2 * 86400;      // small overlap; the journal ignores duplicates
     }
   if(!HistorySelect(from, now + 86400))
     {
      g_status = "Could not read account history.";
      return;
     }

   // 1. find positions that had a closing deal in the window
   ulong ids[];
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      ulong pid = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(pid > 0 && !InList(ids, pid))
        {
         int k = ArraySize(ids);
         ArrayResize(ids, k + 1);
         ids[k] = pid;
        }
     }

   // 2. build and send in batches of 100
   long     offset   = ServerOffsetSeconds();
   string   account  = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string   server   = JsonEscape(AccountInfoString(ACCOUNT_SERVER));
   string   batch    = "";
   int      inBatch  = 0, sent = 0;
   datetime maxClose = 0;
   bool     ok       = true;
   string   reply;

   for(int i = 0; i < ArraySize(ids) && ok; i++)
     {
      datetime ct = 0;
      string pj = PositionJson(ids[i], offset, ct);
      if(pj == "") continue;
      batch += (inBatch > 0 ? "," : "") + pj;
      inBatch++;
      if(ct > maxClose) maxClose = ct;
      if(inBatch >= 100)
        {
         ok = Post("{\"account\":\"" + account + "\",\"server\":\"" + server + "\",\"positions\":[" + batch + "]}", reply);
         sent += inBatch; batch = ""; inBatch = 0;
        }
     }
   if(ok)
      ok = Post("{\"account\":\"" + account + "\",\"server\":\"" + server + "\",\"positions\":[" + batch + "]}", reply);
   sent += inBatch;

   if(ok)
     {
      if(maxClose > 0) GlobalVariableSet(g_gvLast, (double)maxClose);
      g_status = "Last sync " + TimeToString(TimeLocal(), TIME_DATE | TIME_MINUTES) + " - " + IntegerToString(sent) + " closed positions checked.\n" + reply;
      Print("Trade Journal Sync: ", g_status);
     }
  }
//+------------------------------------------------------------------+
