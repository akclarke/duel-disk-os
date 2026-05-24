import React from 'react';
import { connect } from 'react-redux';
import { Progress } from 'semantic-ui-react';
import { SIDE } from '../../Card/utils/constant';
import './HealthBar.css';

class HealthBar extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {
        const { side, environment, game_meta, my_id, opponent_id } = this.props;

        const is_my_turn = game_meta?.current_turn === my_id;
        const is_mine = side === SIDE.MINE;

        // Assign readable names based on who connected first (player_starts is the ID of who goes first)
        const my_name = "Duelist A";
        const opponent_name = "Duelist B";

        const display_name = is_mine ? my_name : opponent_name;
        const hp = environment ? environment[side].hp : 0;

        // Turn indicator — show on whichever side is currently active
        const this_side_is_active = is_mine ? is_my_turn : !is_my_turn;

        return (
            <div className={`health_bar health_bar_${side} ${this_side_is_active ? 'health_bar_active' : ''}`}>
                <div className="health_bar_avatar_username_container">
                    <img
                        className="health_bar_avatar"
                        src="https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/84dc13b7-a2e7-4b45-83ec-311e72e82900/ddg84ua-02d600ad-dc7f-4cdf-b510-c1916324803a.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOiIsImlzcyI6InVybjphcHA6Iiwib2JqIjpbW3sicGF0aCI6IlwvZlwvODRkYzEzYjctYTJlNy00YjQ1LTgzZWMtMzExZTcyZTgyOTAwXC9kZGc4NHVhLTAyZDYwMGFkLWRjN2YtNGNkZi1iNTEwLWMxOTE2MzI0ODAzYS5wbmcifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6ZmlsZS5kb3dubG9hZCJdfQ.U8nOU_7_z8s5trKUg4ZrbNCm8n5Cg4u3b18-_BgkC3U"
                        alt="avatar"
                    />
                    <div className="health_bar_username_container">
                        <div className="health_bar_name_row">
                            <p className="health_bar_username">{display_name}</p>
                            {this_side_is_active && (
                                <span className="health_bar_turn_badge">YOUR TURN</span>
                            )}
                        </div>
                        <p className="health_bar_hp">{hp} LP</p>
                    </div>
                </div>
                <Progress percent={(hp / 8000) * 100} indicating />
            </div>
        )
    }
}

const mapStateToProps = state => {
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;
    const { my_id, opponent_id } = state.serverReducer;
    return { environment, game_meta, my_id, opponent_id };
};

export default connect(mapStateToProps)(HealthBar);