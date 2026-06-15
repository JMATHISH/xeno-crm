from time import sleep

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.agent_service import analyze_step, launch_step


def run_campaign_background(campaign_id: int):
    db: Session = SessionLocal()
    try:
        # Mark the campaign as running, and get the steps in order
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        campaign.status = "running"
        steps = campaign.steps_ordered  # Assuming this gets the steps in the correct order

        # Iterate over the steps
        for step in steps:
            # Mark the step as running
            step.status = "running"
            db.commit()

            # Call the existing launch_step function
            launch_step(step.id, db)

            # Simulate metrics and update step counts & revenue
            sleep(1)  # Sleep to simulate time taken by the step
            step.metrics_simulated = True  # Example of simulating metrics
            campaign.revenue_recovered += step.revenue  # Update campaign revenue
            db.commit()

            # Call the existing analyze_step function
            analyze_step(step.id, db)

            # Mark the step as completed
            step.status = "completed"
            db.commit()

            # Sleep briefly to allow frontend polling to see changes
            sleep(0.1)

        # All steps completed, mark the campaign as completed
        campaign.status = "completed"
        db.commit()

    except Exception as e:
        db.rollback()
        raise e

    finally:
        db.close()