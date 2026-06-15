"""
Brew & Co — seed script
Generates 200 realistic customers with ~700 orders spread across 6 months.

Customer distribution designed to give the agent meaningful segments to target:
  Champions        (30) — recent, frequent, high spend
  Loyal            (25) — regular buyers
  At Risk          (40) — lapsed frequent buyers  ← primary agent target
  Lapsed High Value(30) — big spenders gone quiet ← primary agent target
  Need Attention   (35) — infrequent, mid-tier
  Lost             (40) — one-time or very old buyers
"""

import random
import sys
import os
from datetime import datetime, timedelta
from faker import Faker

# Make sure app is importable when running as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import engine, SessionLocal
from app.models import Base, Customer, Order
from app.services.rfm_engine import compute_all_rfm

fake = Faker("en_IN")
random.seed(42)  # reproducible seed

TODAY = datetime(2026, 6, 10)

# ---------------------------------------------------------------------------
# Product catalogue
# ---------------------------------------------------------------------------
PRODUCTS = [
    {"name": "Espresso Shot",     "category": "beverages",   "price": 80},
    {"name": "Filter Coffee",     "category": "beverages",   "price": 120},
    {"name": "Cappuccino",        "category": "beverages",   "price": 180},
    {"name": "Flat White",        "category": "beverages",   "price": 190},
    {"name": "Latte",             "category": "beverages",   "price": 200},
    {"name": "Iced Americano",    "category": "beverages",   "price": 160},
    {"name": "Cold Brew",         "category": "beverages",   "price": 220},
    {"name": "Mocha",             "category": "beverages",   "price": 230},
    {"name": "Coffee Beans 250g", "category": "beans",       "price": 450},
    {"name": "Coffee Beans 500g", "category": "beans",       "price": 800},
    {"name": "Brew & Co Mug",     "category": "merchandise", "price": 350},
    {"name": "Travel Tumbler",    "category": "merchandise", "price": 650},
    {"name": "Pour Over Kit",     "category": "merchandise", "price": 1200},
]

BEVERAGE_PRODUCTS = [p for p in PRODUCTS if p["category"] == "beverages"]

CITIES = [
    "Mumbai", "Delhi", "Bangalore", "Chennai",
    "Hyderabad", "Pune", "Kolkata", "Ahmedabad",
]

CHANNELS = ["whatsapp", "email", "sms"]
CHANNEL_WEIGHTS = [0.50, 0.35, 0.15]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def pick_product(value_multiplier: float = 1.0) -> dict:
    """
    Pick a product weighted toward high-value items when multiplier > 1.5.
    Higher-value customers are more likely to also buy beans or merchandise.
    """
    if value_multiplier >= 2.0 and random.random() < 0.25:
        return random.choice([p for p in PRODUCTS if p["category"] != "beverages"])
    return random.choice(BEVERAGE_PRODUCTS)


def generate_orders(
    customer_id: int,
    n_orders: int,
    last_order_days_ago: int,
    value_multiplier: float,
    spread_days: int = 160,
) -> list[dict]:
    """
    Generate n_orders for a customer.

    - The most recent order is exactly last_order_days_ago days ago.
    - Historical orders are spread randomly over the previous spread_days.
    - amount = product_price * value_multiplier * small random variance.
    """
    orders = []

    # Most recent order
    recent_dt = TODAY - timedelta(
        days=last_order_days_ago,
        hours=random.randint(8, 20),
    )
    product = pick_product(value_multiplier)
    orders.append({
        "customer_id": customer_id,
        "product_name": product["name"],
        "product_category": product["category"],
        "amount": round(product["price"] * value_multiplier * random.uniform(0.85, 1.15), 2),
        "created_at": recent_dt,
    })

    # Historical orders
    for _ in range(n_orders - 1):
        days_back = random.randint(
            last_order_days_ago + 2,
            last_order_days_ago + spread_days,
        )
        order_dt = TODAY - timedelta(days=days_back, hours=random.randint(8, 20))
        product = pick_product(value_multiplier)
        orders.append({
            "customer_id": customer_id,
            "product_name": product["name"],
            "product_category": product["category"],
            "amount": round(product["price"] * value_multiplier * random.uniform(0.85, 1.15), 2),
            "created_at": order_dt,
        })

    return orders


# ---------------------------------------------------------------------------
# Customer group definitions
# ---------------------------------------------------------------------------
# Each entry drives both the kind of customer and the order pattern.
# value_mult controls how much each order is worth — higher = more spend.

GROUPS = [
    {
        "label":         "champions",
        "count":         30,
        "last_order_days": (1, 12),
        "n_orders":      (10, 15),
        "value_mult":    (2.0, 3.5),
    },
    {
        "label":         "loyal",
        "count":         25,
        "last_order_days": (10, 28),
        "n_orders":      (6, 10),
        "value_mult":    (1.5, 2.5),
    },
    {
        "label":         "at_risk",
        "count":         40,
        "last_order_days": (31, 70),
        "n_orders":      (7, 12),
        "value_mult":    (1.5, 2.5),
    },
    {
        "label":         "lapsed_high_value",
        "count":         30,
        "last_order_days": (65, 100),
        "n_orders":      (6, 10),
        "value_mult":    (2.0, 3.5),
    },
    {
        "label":         "need_attention",
        "count":         35,
        "last_order_days": (30, 75),
        "n_orders":      (3, 5),
        "value_mult":    (1.0, 1.8),
    },
    {
        "label":         "lost",
        "count":         40,
        "last_order_days": (75, 180),
        "n_orders":      (1, 2),
        "value_mult":    (0.8, 1.2),
    },
]


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------

def seed() -> None:
    print("Creating database tables …")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    # Wipe existing data cleanly (order matters due to foreign keys)
    db.query(Order).delete()
    db.query(Customer).delete()
    db.commit()

    total_customers = 0
    total_orders = 0

    for group in GROUPS:
        print(f"  Seeding group: {group['label']} ({group['count']} customers) …")

        for _ in range(group["count"]):
            last_order_days = random.randint(*group["last_order_days"])
            n_orders = random.randint(*group["n_orders"])
            value_mult = random.uniform(*group["value_mult"])

            # Create customer
            joined_days_ago = last_order_days + random.randint(10, 60)
            customer = Customer(
                name=fake.name(),
                email=fake.unique.email(),
                phone=f"+91{random.randint(7000000000, 9999999999)}",
                city=random.choice(CITIES),
                channel_preference=random.choices(CHANNELS, weights=CHANNEL_WEIGHTS)[0],
                created_at=TODAY - timedelta(days=joined_days_ago),
            )
            db.add(customer)
            db.flush()  # assigns customer.id without committing

            # Create orders
            orders_data = generate_orders(
                customer_id=customer.id,
                n_orders=n_orders,
                last_order_days_ago=last_order_days,
                value_multiplier=value_mult,
            )
            for order_data in orders_data:
                db.add(Order(**order_data))

            total_customers += 1
            total_orders += n_orders

    db.commit()
    print(f"\n✓ Created {total_customers} customers and {total_orders} orders")

    # Compute RFM scores for all customers
    print("\nComputing RFM scores …")
    tier_counts = compute_all_rfm(db)

    print("\nRFM tier distribution:")
    for tier, count in sorted(tier_counts.items(), key=lambda x: -x[1]):
        bar = "█" * count
        print(f"  {tier:<22} {count:>3}  {bar}")

    db.close()
    print("\n✓ Brew & Co database seeded successfully!")


if __name__ == "__main__":
    seed()