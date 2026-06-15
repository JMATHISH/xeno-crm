import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

# Use TestClient for simple integration-style tests
client = TestClient(app)

class DummyCampaign:
    def __init__(self, id=123, name='Dummy', goal='goal', goal_amount=50000):
        self.id = id
        self.name = name
        self.goal = goal
        self.goal_amount = goal_amount
        self.status = 'draft'
        self.revenue_recovered = 0
        self.total_customers_reached = 0
        self.steps = []
        self.agent_plan = {'strategy_summary': 'summary'}


def test_copilot_missing_key(monkeypatch):
    # Ensure missing GEMINI_API_KEY returns 503
    from app.services.config import settings
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', '')
    res = client.post('/api/agent/copilot', json={'prompt': 'Bring back customers', 'goal_amount': 50000})
    assert res.status_code == 503
    assert 'Gemini API key' in res.json().get('detail', '')


def test_copilot_happy_path(monkeypatch):
    # Mock run_campaign_agent and predict_campaign_outcome to avoid making Gemini calls
    from app.routers import agent as agent_router

    dummy = DummyCampaign()

    def fake_run_campaign_agent(goal, goal_amount, db):
        # Create a campaign-like object with one dummy step
        dummy.steps = []
        class Step:
            def __init__(self):
                self.id = 1
                self.step_number = 1
                self.segment_label = 'At Risk'
                self.rfm_filter = {'recency_min': 2, 'recency_max': 3}
                self.channel = 'whatsapp'
                self.offer_text = '₹150 off'
                self.message = 'Hi {name}, come back!'
                self.customer_ids = []
                self.pre_reasoning = {'reasons': []}
        dummy.steps.append(Step())
        return dummy

    def fake_predict(db, campaign_id):
        return {'predicted_revenue': 42000.0, 'predicted_conversions': 21, 'success_probability': 65.5, 'step_predictions': [], 'explanation': {}}

    monkeypatch.setattr(agent_router, 'run_campaign_agent', fake_run_campaign_agent)
    from app.services import revenue_predictor
    monkeypatch.setattr(revenue_predictor, 'predict_campaign_outcome', fake_predict)

    # Ensure GEMINI_API_KEY is set to skip the earlier check
    from app.services.config import settings
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'fake-key')

    res = client.post('/api/agent/copilot', json={'prompt': 'Bring back customers inactive for 60 days and recover ₹50,000.', 'goal_amount': 50000})
    assert res.status_code == 200
    data = res.json()
    assert 'campaign' in data
    assert 'prediction' in data
    assert data['prediction']['predicted_revenue'] == 42000.0
    assert len(data['steps']) == 1